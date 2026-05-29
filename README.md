# BillFlow WA: Modern WhatsApp Billing & Digital Receipt SaaS

BillFlow WA is an ultra-premium, modern, and highly responsive Billing and WhatsApp Automation platform designed specifically for retail shops, restaurants, service agencies, and small-to-medium businesses. 

It is designed to be lightweight, incredibly fast, and 100% ready for white-labeling and reselling. You can host this platform as a centralized subscription SaaS, sell it as a premium local self-hosted desktop portal, or bundle it for specific industry verticals.

---

##  Premium Features

1. **Store Configuration & White-labeling**:
   - Customize store name, manager details, currency symbols, and address.
   - Upload branding logos displayed instantly on hosted receipts.
   - Default tax labels (e.g. GSTIN, VAT ID) automatically printed.

2. **Quick POS Invoice Generator**:
   - **Autocomplete Customer Directory**: Search customer databases by name or phone numbers. Select matches to auto-populate customer metadata instantly.
   - **Reactive Item Calculator**: Dynamic line-item rows calculate rates, taxes, discounts, and subtotals in real-time with fluid visual transitions.
   - **Simulated Real-time Thermal Receipt**: A beautiful virtual mockup of the thermal bill updates instantly as items are entered.

3. **Dynamic UPI Payments (Scan-to-Pay)**:
   - On business submission, BillFlow WA formats standard UPI payment strings incorporating the store's UPI address, currency, merchant name, and invoice grand total.
   - Renders a clean dynamic QR code on the hosted digital receipt for scan-to-pay convenience.
   - Mobile customers can tap a single action button to launch their native banking apps (Google Pay, PhonePe, Paytm) instantly with the payment details pre-filled.

4. **Zero-Cost WhatsApp Automation**:
   - Uses WhatsApp's official redirection protocol to compose rich textual billing summaries decorated with professional emojis, bold metrics, and hosted digital receipt links.
   - Merges customer names, invoice IDs, and total values instantly.
   - Operates 100% free of Meta API charges, completely eliminating risk of number blocks or Meta developer account requirements.

5. **Mass Broadcast Campaigns **:
   - **Dynamic Message Composer**: Write promotional text alerts or custom discounts using dynamic placeholders like `{customer_name}` and `{business_name}`.
   - **Direct Redirection Queue Runner (Free & Safe)**: Broadcasts offers manually to your entire customer list without incurring API costs. A beautiful progressive runner lets you click "Dispatch" in sequence for each customer, auto-advancing as you progress.
   - **Campaign Persistent History Ledger**: Complete tracking of sent campaigns, target audience pools, progress indicators, and statuses.

6. **Invoice & Customer Registry**:
   - Complete historical ledger of past sales.
   - Adjust payment status flags (Paid, Unpaid, Cancelled) dynamically.
   - Filter, print, download PDF, or resend notifications instantly.

7. **Mini-Inventory Catalog Manager **:
   - Create a persistent database of store products containing SKUs, names, standard unit rates, tax percentages, and stock levels.
   - **POS Item Autocomplete**: As you type item names in the POS creator, matching products from the catalog are suggested. Clicking a suggestion auto-fills rates, default taxes, and live stock levels.
   - **Transactional Stock Auto-Deduction**: Submitting an invoice automatically decrements the respective product's stock levels in the database transaction, warning you when stock falls below 5 ("Low Stock") or reaches 0 ("Out of Stock").

8. **UPI Confirmation Polling & Cash Chimes **:
   - **Interactive Receipt Checkouts**: Dynamic hosted digital receipts (`/receipt/{hash}`) feature a prominent glowing "Mark as Paid / Confirm UPI Payment" button.
   - **Background UPI Polling**: The merchant dashboard polls the database state in the background. If a customer confirms their payment on their receipt, the dashboard instantly detects the status change.
   - **Web Audio Cash Register Double-Chime**: Instantly synthesizes a beautiful, offline-capable "Cha-Ching" double-chime tone natively using the browser's built-in **Web Audio API** (zero heavy external audio asset files or network lag!).
   - **Real-Time Stat Updates**: Metrics, counters, and recent invoices tables refresh automatically upon receiving payment chimes.

---

## Technology Stack

- **Backend**: FastAPI (Python 3.13) + SQLAlchemy (SQLite Database). Asynchronous, high-performance, and lightweight.
- **Frontend SPA**: HTML5, custom HSL Vanilla CSS3 variable theme, and modular ES6 Vanilla JavaScript (using async fetching). Highly reactive, no heavy node build pipelines required.
- **Payments**: Standard UPI String formatting + dynamic client-side QR generation.
- **Hosting / Print**: Built-in `@media print` sheets style receipt tables beautifully for printing or saving as PDF natively in any browser.

---

## Easy Setup & Execution

### Prerequisites
Make sure Python 3.13+ is installed on your computer.

### 1. Installation
Clone or copy the project files to your folder, open a terminal, and run:
```bash
pip3 install -r requirements.txt
```

### 2. Launch the Application
Start the Uvicorn local development server:
```bash
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Open the Dashboard
- **Merchant Billing Panel**: Open `http://localhost:8000` in your web browser.
- **Interactive API Documentation (Swagger)**: Open `http://localhost:8000/docs` to inspect backend endpoints.

---
