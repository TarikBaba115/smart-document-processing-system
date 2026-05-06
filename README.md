# Smart Document Processing System

## Overview

This project ingests business documents, extracts structured data with Google Document AI, validates the extracted values, and presents the results through a browser-based review workflow.

## Live Application

Public application link: [insert link here]

Swagger API docs: `/api-docs`

## Features

- Upload invoice or purchase-order documents.
- Extract supplier, document number, dates, currency, totals, and line items.
- Validate missing fields, duplicate document numbers, date issues, and total mismatches.
- Review and correct document data before saving.
- View the document dashboard and issue list.
- Delete multiple documents from the dashboard.
- Generate API documentation with Swagger UI.

## Tech Stack

- Node.js and Express
- Sequelize ORM
- MySQL or PostgreSQL compatible via Sequelize configuration
- Google Cloud Document AI
- Swagger UI and swagger-jsdoc
- Docker

## Project Structure

- `Repository/app.js` - Express server and API routes.
- `Repository/invoiceProcessor.js` - Document AI extraction and enrichment.
- `Repository/models` - Sequelize models and associations.
- `Repository/dashboard.*` - Document list UI.
- `Repository/document.*` - Document review UI.
- `Repository/docker-compose.yml` - Local app and database setup.

## Setup

### 1. Install dependencies

From the `Repository` folder:

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in `Repository` and set the values your deployment needs:

```bash
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=document_processing
DB_USER=root
DB_PASSWORD=root
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
```

If you deploy to Render, you can provide the service account JSON through `GOOGLE_APPLICATION_CREDENTIALS_JSON` instead of mounting a file.

### 3. Run locally

```bash
npm start
```

Open the app in your browser and use `/api-docs` for the Swagger UI.

## Docker

Build the image from the `Repository` folder:

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

## Deployment Notes

- The app listens on `PORT`, which defaults to `3000`.
- Database credentials must be supplied by the host environment.
- Google Document AI credentials must be available through ADC or `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
- After deployment, replace the placeholder above with the public application URL.

## Approach

The implementation is split into three layers.

- The server layer handles upload, persistence, status updates, deletion, and API documentation.
- The extraction layer sends documents to Google Document AI and then enriches missing fields with regex-based fallback parsing.
- The review layer lets users inspect extracted data, correct it, and save validated results.

Validation is treated as part of the workflow rather than a separate afterthought. The app compares computed line-item totals against the stored subtotal, tax, and total values, and it flags mismatches so the reviewer can decide whether the document is acceptable.

## AI Usage

- AI tools were used to accelerate implementation and documentation.
- The final validation and business rules remain part of the application logic.

## Improvements

- Add automated tests for extraction and validation.
- Add role-based access control.
- Support more document formats and more resilient OCR fallback parsing.
- Add richer audit history for document edits and status changes.

## Submission Checklist

- Repository link
- Public application link
- Setup instructions
- Explanation of approach

## Contact

If you need to share the completed submission, send the repository link and live application link to `careers@mastery.ba`.
