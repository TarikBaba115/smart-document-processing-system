# Smart Document Processing System

## Overview

This project ingests business documents, extracts structured data with Google Document AI, validates the extracted values, and presents the results through a browser-based review workflow.

## Live Application

Public application link: [https://smart-document-processing-system-pugi.onrender.com/dashboard.html]

Swagger API docs: `/api-docs`

## Features

- Upload invoice or purchase-order documents.
- Extract supplier, document number, dates, currency, totals, and line items.
- Validate missing fields, duplicate document numbers, date issues, and total mismatches.
- Review and correct document data before saving.
- View the document dashboard and issue list.
- Delete documents from the dashboard.
- API documentation with Swagger UI.

## Tech Stack

- Node.js and Express
- Sequelize ORM
- MySQL or PostgreSQL compatible via Sequelize configuration
- Google Cloud Document AI
- Swagger UI and swagger-jsdoc
- Docker

## Project Structure

- `app.js` - Express server and API routes.
- `invoiceProcessor.js` - Document AI extraction and enrichment.
- `models` - Sequelize models and associations.
- `dashboard.*` - Document list UI.
- `document.*` - Document review UI.
- `docker-compose.yml` - Local app and database setup.

## Setup

### 1. Install dependencies

From the root folder:

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file and set the values your deployment needs:

```bash
PORT=3000
DATABASE_URL= DIALECT://USER:PASSWORD@HOST:PORT/DATABASE (use mysql://root:root@localhost:3306/document_processing if starting app with docker compose)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id (not needed if you have GOOGLE_APPLICATION_CREDENTIALS_JSON)
GOOGLE_APPLICATION_CREDENTIALS_JSON=C:\path\to\service-account.json
```

If you deploy to Render, you can provide the service account JSON through `GOOGLE_APPLICATION_CREDENTIALS_JSON` instead of mounting a file.

### 3. Run locally

```bash
npm start
```

Open the app in your browser and use `/api-docs` for the Swagger UI.

## Docker

Build the image from the root folder:

```bash
docker build -t document-processing-app .
```

Run it with the required environment variables:

```bash
docker run -p 3000:3000 --env-file .env document-processing-app
```

## Docker Compose

The included `docker-compose.yml` starts the app and a MySQL container.

```bash
docker compose up --build
```

## Approach

The implementation is split into three layers.

- The server layer handles upload, persistence, status updates, deletion, and API documentation.
- The extraction layer sends documents to Google Document AI and then enriches missing fields with regex-based fallback parsing.
- The review layer lets users inspect extracted data, correct it, and save validated results.

Validation is treated as part of the workflow rather than a separate afterthought. The app compares computed line-item totals against the stored subtotal, tax, and total values, and it flags mismatches so the reviewer can decide whether the document is acceptable.

## AI Usage

- GitHub Copilot: generating database and api routes boilerplate, generating frontend (HTML/CSS), help with understanding code, modifying current logic
- Claude: Help in researching, designing system, setting up Docker
- ChatGPT: Exploring and comparing API options for document processing, setting up deployment

## Improvements

- Add unit tests for extraction and validation.
- Add role-based access control.
- Support more document formats.
- Exploring more powerful models for data extraction from scanned documents
