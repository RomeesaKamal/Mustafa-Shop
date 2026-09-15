# 🛍️ Mustafa's Shop

> A phone-first shop management Progressive Web App for managing **Snacks, Stationery, and Photocopy & Printing** counters from one place.

**🌐 Live Demo:** [Mustafa's Shop — Live App](https://mustafa-shop-stationary-two.vercel.app/?utm_source=chatgpt.com)

---

## 📌 Overview

**Mustafa's Shop** is a modern, phone-first shop management application developed for a **real local shop in my village**.

The application brings everyday shop operations into one simple interface, including **stock management, sales, photocopy & printing services, customer credit (Khata), purchase bills, customer requests, and shop fund management**.

It is designed as a **Progressive Web App (PWA)**, allowing it to be installed and used like a mobile application on supported devices.

### 🔒 Privacy-First

All shop data is stored locally on the device using browser storage.

**No shop data is uploaded to a server or cloud database.**

---

## ✨ Features

### 🏠 Dashboard

The home dashboard provides a quick overview of the shop:

* Today's total sales
* Sales separated by counter
* Profit for the last 14 days
* Low-stock products
* Outstanding Khata balances
* Unpaid purchase bills
* Available stock fund

---

### 📦 Stock Management

Manage inventory quickly from a phone.

* 📷 Scan product barcodes
* 🔎 Search existing products
* ➕ Add new products
* 📸 Use a product photo to help identify items without barcodes
* 📦 Sell products by piece or box
* 💰 Store purchase and selling prices
* 🔄 Quickly restock existing products
* ⚠️ Monitor low-stock items

If a barcode already exists, restocking only requires entering the quantity received.

---

### 💰 Sales

Record different types of sales from one place.

#### 🛒 Product Sales

* Scan a barcode
* Search for a product
* Select quantity
* Automatically calculate the sale amount
* Calculate product profit

#### 🖨️ Photocopy & Printing

The application supports common printing-shop services:

* Photocopy
* Black & white printing
* Colour printing
* Scanning
* Binding
* Lamination

Saved rates make regular transactions faster — usually requiring only the service and page quantity.

Paper and ink costs can be included so the application can calculate a more realistic profit.

---

### 📒 Khata — Customer Credit

Digitally manage customer credit accounts.

* Create customer accounts
* Record items taken on credit
* Record payments
* Store transaction dates
* View account history day by day
* Close accounts when customers leave the area
* Preserve the customer's complete history
* Permanently delete accounts when required

Closing an account removes it from the active customer list while preserving its historical transactions.

---

### 🧾 Purchase Bills

Keep digital records of purchases made from suppliers.

Each purchase can include:

* Supplier name
* Purchase amount
* Date
* Paid / unpaid status
* Photograph of the purchase bill

Bill images are compressed before being stored to reduce device storage usage.

---

### 💡 Customer Suggestions

Record products that customers request but the shop does not currently stock.

This creates a useful buying list for future market trips instead of relying on memory.

---

### 🤝 Partners & Stock Fund

Manage the distribution of shop profits.

A configurable percentage of profit can remain in the shop as a **stock fund** for purchasing new inventory.

The remaining profit can then be divided between partners.

When a purchase bill is marked as paid from the stock fund, the available balance is automatically reduced.

This provides a clear view of:

> **How much money is currently available for restocking.**

---

## 📱 Progressive Web App

Mustafa's Shop is built as a **Progressive Web App (PWA)**.

On supported devices, it can be installed directly from the browser and used like a regular mobile application.

The interface is designed primarily for **phone usage**, making common shop operations quick and convenient while working at the counter.

---

## 🛠️ Built With

| Technology                   | Purpose                           |
| ---------------------------- | --------------------------------- |
| ⚛️ React                     | User interface                    |
| ⚡ Vite                       | Development & build tooling       |
| 🎨 Tailwind CSS              | Styling & responsive design       |
| 📊 Recharts                  | Charts and data visualization     |
| 🧩 Lucide React              | Icons                             |
| 🧠 TensorFlow.js / MobileNet | Image-based product recognition   |
| 📱 vite-plugin-pwa           | Progressive Web App functionality |
| 🌐 BarcodeDetector API       | Barcode scanning                  |

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/RomeesaKamal/Mustafa-Shop.git
```

### 2. Open the project

```bash
cd Mustafa-Shop
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the development server

```bash
npm run dev
```

The application will be available at the local Vite development URL.

---

## 🏗️ Production Build

Create a production build:

```bash
npm run build
```

The production files will be generated inside:

```text
dist/
```

Preview the production build locally:

```bash
npm run preview
```

---

## ⚠️ Notes & Limitations

### 📷 Barcode Scanner

Barcode scanning uses the browser's built-in `BarcodeDetector` API.

Browser support varies. Chrome on Android supports the required functionality, while Safari has limitations.

A manual barcode input option is also available.

### 🧠 Image-Based Product Naming

The image recognition feature uses a general image model to identify objects.

For example, it may recognise an object as:

* Bottle
* Notebook
* Box
* Pen

It is intended as a shortcut for entering product information rather than a product or brand database.

### 🏷️ Barcode Information

A barcode identifies a product but does not automatically provide the shop's:

* Purchase price
* Selling price
* Stock quantity

These values are entered by the shop owner.

Once an item has been saved, the same barcode can be used for faster future restocking and sales.

### 💾 Local Storage

Shop data is stored in the browser on the device being used.

Therefore:

* Clearing browser/site data can remove the shop record.
* Data is not automatically synchronized between devices.
* Two devices maintain separate records.
* A shared multi-device system would require a backend or cloud database.

---

## 🎯 Project Purpose

Mustafa's Shop was developed as a **real-world shop management application for a local shop in my village**.

The goal is to simplify everyday shop operations such as **managing stock, recording sales, handling customer credit (Khata), tracking purchase bills, managing photocopy & printing services, and monitoring shop funds** through a simple phone-first application.

The application was designed around the **actual needs and workflow of the shop**, rather than being created as a tutorial or demonstration project.

---

## 👩‍💻 Developer

**Romeesa Kamal**

BS Computer Engineering student interested in **software development, problem-solving, logic building, and modern web technologies**.

Currently expanding my programming foundations through **C and C++** while continuing to build practical solutions using modern web technologies.

---

> 💡 **Building for real problems. Learning through real projects. Growing through every challenge.**
