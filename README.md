# GST Compliance & Transaction Management System

A professional, full-featured GST compliance system built with Node.js (Express) and a modern Vanilla JS/CSS "Glassmorphism" frontend. Now migrated from SQLite to **MySQL 8 via Docker** for high-performance and multi-user support.

---

## 🚀 Quick Start (Docker)

The easiest way to run the system is using Docker Desktop:

1.  **Clone/Download** the repository.
2.  **Start MySQL**: Run `docker-compose up -d` in the root directory.
3.  **Install Dependencies**: `npm install`
4.  **Start Server**: `npm start`
5.  **Open**: [http://localhost:3000](http://localhost:3000)
    - **Login**: `admin@gst.local` / `Admin@123`

---

## 🛠️ Key Components

- **Frontend**: Single Page Application (SPA) using Vanilla JavaScript, HTML5, and Premium CSS3 (Glassmorphism design system). Supports Dark/Light themes and Multi-Currency.
- **Backend**: Node.js & Express API with robust `express-validator` security and JWT authentication.
- **Database**: MySQL 8 (local/Dockerized) for secure, scalable transaction management.
- **Invoicing**: Generates professional PDF invoices with automated tax calculations (CGST/SGST/IGST).
- **Compliance**: Automatic GSTR Preparation, Compliance Calendar, and IRN/Acknowledgment generation.

---

## 🐙 How to Push to GitHub

To store your code on GitHub without uploading heavy folders like `node_modules`:

1.  **Initialize Git**:
    ```bash
    git init
    ```
2.  **Add Files**:
    ```bash
    git add .
    ```
3.  **Commit**:
    ```bash
    git commit -m "Initial commit: GST system with MySQL & Docker"
    ```
4.  **Create Repository on GitHub**: Create a new public/private repo on [github.com](https://github.com).
5.  **Link and Push**:
    ```bash
    git remote add origin <YOUR_GITHUB_REPO_URL>
    git branch -M main
    git push -u origin main
    ```

*Note: Your `.gitignore` is already set up to exclude `node_modules`, `.env`, and local database files.*

---

## 📁 Technical Structure

- `backend/server.js` - Main entry point.
- `backend/routes/` - API endpoints (Invoices, Parties, Returns, etc.).
- `backend/utils/db.js` - MySQL Pool & Schema management.
- `frontend/js/` - Frontend page logic and UI interaction.
- `docker-compose.yml` - MySQL 8 orchestration.

---

## ⚖️ Troubleshooting

- **Database Errors?** Ensure Docker Desktop is running.
- **Port 3000 busy?** Update `PORT` in `.env`.
- **Missing modules?** Run `npm install` inside the project folder.

---
© 2026 GST Compliance System
