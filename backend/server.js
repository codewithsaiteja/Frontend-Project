require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const compression= require('compression');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const http       = require('http');
const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const { initDb } = require('./utils/db');
const Chat       = require('./models/Chat');
const Ticket     = require('./models/Ticket');

const app    = express();
const server = http.createServer(app);

const SECRET = process.env.JWT_SECRET || 'gst_secret';

/* ── Socket.IO ─────────────────────────────────────────────── */
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

/* ── Middleware ─────────────────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs:15*60*1000, max:500, standardHeaders:true, legacyHeaders:false }));
app.use(express.static(path.join(__dirname, '../frontend')));

/* ── Routes ─────────────────────────────────────────────────── */
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/parties',    require('./routes/parties'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/purchases',  require('./routes/purchases'));
app.use('/api/returns',    require('./routes/returns'));
app.use('/api/reconcile',  require('./routes/reconcile'));
app.use('/api/hsn',        require('./routes/hsn'));
app.use('/api/analytics',  require('./routes/analytics'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/tds',        require('./routes/tds'));
app.use('/api/export',     require('./routes/export'));
app.use('/api/audit',      require('./routes/audit'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/tickets',    require('./routes/tickets'));

const { auth } = require('./middleware/auth');

/* ── Chat REST ──────────────────────────────────────────────── */
// GET /api/chat/rooms  — admin: all rooms with last message
app.get('/api/chat/rooms', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success:false, message:'Admin only' });
    const rooms = await Chat.aggregate([
      { $sort:  { created_at: -1 } },
      { $group: { _id:'$room', lastMessage:{ $first:'$message' }, lastTime:{ $first:'$created_at' }, senderName:{ $first:'$senderName' }, unread:{ $sum:{ $cond:[{ $and:[{ $eq:['$role','user'] },{ $eq:['$read',false] }] },1,0] } } } },
      { $sort:  { lastTime: -1 } },
    ]);
    res.json({ success:true, data:rooms });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// GET /api/chat/:room  — history
app.get('/api/chat/:room', auth, async (req, res) => {
  try {
    const room = req.params.room;
    const isOwner = room === `chat_${req.user._id}`;
    if (req.user.role !== 'admin' && !isOwner)
      return res.status(403).json({ success:false, message:'Access denied' });
    const msgs = await Chat.find({ room }).sort({ created_at:1 }).limit(200).lean();
    if (req.user.role === 'admin')
      await Chat.updateMany({ room, role:'user', read:false }, { read:true }).catch(()=>{});
    res.json({ success:true, data:msgs });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

app.get('/api/backup', auth, (req,res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success:false, message:'Admin only' });
  res.json({ success:true, message:'Use mongodump. URI: '+(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/gst_system') });
});

// POST /api/tickets-notify — emit socket event after ticket created (called internally)
// Ticket creation is already in routes/tickets.js; we expose an internal hook via io
app.set('io', io);

app.get('*', (req,res) => {
  if (!req.path.startsWith('/api'))
    res.sendFile(path.join(__dirname,'../frontend/index.html'));
});

app.use((err,req,res,next) => {
  console.error(err.stack);
  res.status(err.status||500).json({ success:false, message:err.message||'Internal server error' });
});

/* ══════════════════════════════════════════════════════════════
   SOCKET.IO  — Room-based messaging
   Rooms:  user room  = "chat_<userId>"
           admin room = "admin_watch"  (admins join this for broadcasts)
══════════════════════════════════════════════════════════════ */
// Track online users: socketId → { userId, userName, role, room }
const online = new Map();

// Bot auto-reply logic — returns { message, resolved }
function botReply(userMessage) {
  const msg = (userMessage || '').toLowerCase();

  if (msg.includes('invoice') || msg.includes('bill')) {
    return { resolved: true,  message: 'To manage invoices, navigate to the "Sales Invoices" tab. You can create, edit, and review your tax invoices there. 📄' };
  }
  if (msg.includes('return') || msg.includes('gstr')) {
    return { resolved: true,  message: 'GST returns (GSTR-1, GSTR-3B etc.) are under the "GST Returns" tab. Make sure your invoices are reconciled before filing. 📊' };
  }
  if (msg.includes('hsn') || msg.includes('sac')) {
    return { resolved: true,  message: 'Search for HSN/SAC codes and GST rates anytime using the "HSN Lookup" tool in the sidebar. 🔍' };
  }
  if (msg.includes('password') || msg.includes('login') || msg.includes('account')) {
    return { resolved: true,  message: 'To reset your password, go to Profile Settings or contact the admin for a reset link. 🔐' };
  }
  if (msg.includes('compliance') || msg.includes('calendar') || msg.includes('due') || msg.includes('overdue') || msg.includes('deadline')) {
    return { resolved: true,  message: 'Open the "Compliance" tab to see all your upcoming, pending, and overdue GST filing deadlines. 📅' };
  }
  if (msg.includes('purchase') || msg.includes('expense')) {
    return { resolved: true,  message: 'Track all your purchases and expenses under the "Purchases" section in the sidebar. 🧾' };
  }
  if (msg.includes('tds') || msg.includes('tax deducted')) {
    return { resolved: true,  message: 'You can manage TDS entries and reports from the "TDS" module in the sidebar. 💰' };
  }
  if (msg.includes('export') || msg.includes('download') || msg.includes('report') || msg.includes('pdf') || msg.includes('excel')) {
    return { resolved: true,  message: 'Use the "Export" feature (available on most pages) to download reports as PDF or Excel. 📥' };
  }
  if (msg.includes('party') || msg.includes('supplier') || msg.includes('customer') || msg.includes('vendor')) {
    return { resolved: true,  message: 'Manage all your parties (customers, suppliers, vendors) under the "Parties" section. 👥' };
  }
  if (msg.includes('reconcil')) {
    return { resolved: true,  message: 'Reconcile your purchase data with GSTR-2A/2B under the "Reconciliation" tab. It helps identify mismatches before filing. ✅' };
  }
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg === 'hello' || msg === 'hi') {
    return { resolved: true,  message: 'Hello! I am the GST Support Bot 🤖. I can help with invoices, GST returns, HSN codes, compliance calendars, and more. What do you need help with?' };
  }
  if (msg.includes('thank') || msg.includes('thanks') || msg.includes('ok') || msg.includes('okay') || msg.includes('got it')) {
    return { resolved: true, message: 'You\'re welcome! Is there anything else I can help you with? 😊' };
  }

  // Bot could not resolve
  return { resolved: false, message: "I'm sorry, I couldn't fully understand your query. I'll try once more — please describe your issue in different words, or I can raise a support ticket for you." };
}

// Track bot fail counts per room: room → { count, warned }
const botFails = new Map();

function broadcastOnlineUsers() {
  const users = [];
  online.forEach((d, sid) => {
    if (d.role !== 'admin') users.push({ socketId:sid, userId:d.userId, userName:d.userName, room:d.room });
  });
  io.to('admin_watch').emit('onlineUsers', users);
}

// Check if any admin socket is actively watching a specific room
function adminWatchingRoom(room) {
  let found = false;
  online.forEach(d => { if (d.role === 'admin' && d.activeRoom === room) found = true; });
  return found;
}

io.on('connection', socket => {
  console.log('🔌 Socket connected:', socket.id);

  /* ── Authenticate ── */
  socket.on('authenticate', data => {
    try {
      if (!data || !data.token) throw new Error('No token');
      const decoded  = jwt.verify(data.token, SECRET);
      const userId   = String(decoded.id || decoded._id || data.userId || '');
      const userName = data.userName || decoded.name || 'User';
      const role     = decoded.role  || data.role   || 'user';

      online.set(socket.id, { userId, userName, role, room:null, activeRoom:null });

      if (role === 'admin') {
        socket.join('admin_watch');
        socket.emit('authenticated', { ok:true, role:'admin' });

        // Send existing rooms to this admin
        Chat.aggregate([
          { $sort:  { created_at: -1 } },
          { $group: { _id:'$room', lastMessage:{ $first:'$message' }, lastTime:{ $first:'$created_at' }, senderName:{ $first:'$senderName' }, unread:{ $sum:{ $cond:[{ $and:[{ $eq:['$role','user'] },{ $eq:['$read',false] }] },1,0] } } } },
          { $sort:  { lastTime: -1 } },
        ]).then(rooms => socket.emit('roomList', rooms)).catch(()=>{});
      } else {
        const room = `chat_${userId}`;
        online.get(socket.id).room = room;
        socket.join(room);
        socket.emit('authenticated', { ok:true, role:'user', room });
        broadcastOnlineUsers();
        console.log(`✅ User authenticated: ${userName} (${userId}) → room ${room}`);
      }
    } catch(e) {
      console.warn('❌ Socket auth fail:', e.message);
      socket.emit('authenticated', { ok:false, error:'Invalid token' });
    }
  });

  /* ── Join room (admin switching conversations) ── */
  socket.on('joinRoom', room => {
    const d = online.get(socket.id);
    if (!d) return;
    if (d.activeRoom) socket.leave(d.activeRoom);
    d.activeRoom = room;
    socket.join(room);
    console.log(`👥 ${d.userName} joined room ${room}`);
  });

  /* ── Send message ── */
  socket.on('sendMessage', async data => {
    if (!data || !data.room || !String(data.message||'').trim()) return;

    const payload = {
      room:        data.room,
      sender:      data.userId || data.sender || 'unknown',
      senderName:  data.senderName || data.sender || 'User',
      role:        data.role || 'user',
      userId:      data.userId || '',
      message:     String(data.message).trim(),
      read:        false,
      created_at:  new Date().toISOString(),
    };

    // Persist
    try {
      const saved = await Chat.create(payload);
      payload._id = String(saved._id);
    } catch(e) { console.error('❌ Chat save error:', e.message); }

    // Deliver to room (includes sender — they'll see their own message)
    io.to(data.room).emit('receiveMessage', payload);

    // Notify admin panel live (sidebar update)
    if (payload.role !== 'admin') {
      io.to('admin_watch').emit('newUserMessage', {
        room:       data.room,
        userId:     data.userId,
        senderName: payload.senderName,
        lastMessage:payload.message,
        lastTime:   payload.created_at,
      });

      // ── BOT AUTO-REPLY ──────────────────────────────────────
      // If no admin is actively watching this room, send bot reply after 1.5s
      if (!adminWatchingRoom(data.room)) {
        setTimeout(async () => {
          const { message: botMessage, resolved } = botReply(payload.message);

          // Track failures per room
          if (!resolved) {
            const fail = botFails.get(data.room) || { count: 0, warned: false };
            fail.count++;
            botFails.set(data.room, fail);
          } else {
            // Reset fail count if bot successfully resolved
            botFails.delete(data.room);
          }

          const fail = botFails.get(data.room) || { count: 0 };
          const shouldPromptTicket = !resolved && fail.count >= 2;

          const botMsg = {
            room:        data.room,
            sender:      'bot',
            senderName:  'GST Support Bot 🤖',
            role:        'admin',
            userId:      'bot',
            message:     shouldPromptTicket
              ? "I've tried my best but I'm unable to resolve your query right now. No admin is currently online. Would you like to raise a support ticket? An admin will review it and get back to you."
              : botMessage,
            type:        shouldPromptTicket ? 'ticket_prompt' : 'text',
            read:        true,
            created_at:  new Date().toISOString(),
          };

          if (shouldPromptTicket) {
            // Reset so it doesn't keep prompting every message
            botFails.set(data.room, { count: 0, warned: true });
          }

          try { await Chat.create(botMsg); } catch(e) {}
          io.to(data.room).emit('receiveMessage', botMsg);
          // Also notify admin panel
          io.to('admin_watch').emit('newUserMessage', {
            room:       data.room,
            senderName: botMsg.senderName,
            lastMessage:botMsg.message,
            lastTime:   botMsg.created_at,
          });
        }, 1500);
      }
    }

    console.log(`💬 [${data.room}] ${payload.senderName}: ${payload.message.substring(0,60)}`);
  });

  /* ── Typing ── */
  socket.on('typing',     data => { if (data?.room) socket.to(data.room).emit('typing',     { room:data.room, sender:data.sender }); });
  socket.on('stopTyping', data => { if (data?.room) socket.to(data.room).emit('stopTyping', { room:data.room }); });

  /* ── Mark read ── */
  socket.on('markRead', async room => {
    try { await Chat.updateMany({ room, role:'user', read:false }, { read:true }); } catch(e) {}
  });

  /* ── Disconnect ── */
  socket.on('disconnect', () => {
    const d = online.get(socket.id);
    console.log(`❌ Disconnected: ${d?.userName || socket.id}`);
    online.delete(socket.id);
    broadcastOnlineUsers();
  });
});

/* ── Start ──────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  try {
    const cron = require('node-cron');
    const { updateOverdueCompliance } = require('./utils/compliance');
    cron.schedule('0 6 * * *', updateOverdueCompliance);
  } catch(e) {}
  server.listen(PORT, () => {
    console.log(`\n🚀 GST System → http://localhost:${PORT}`);
    console.log(`📧 Login: admin@gst.local  🔑 Password: Admin@123\n`);
  });
}).catch(err => {
  console.error('❌ DB init failed:', err.message);
  process.exit(1);
});