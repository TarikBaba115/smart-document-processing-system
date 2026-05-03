const axios = require("axios");

async function classifyDocument(file) {
  const response = await axios.post(
    "https://api.veryfi.com/api/v8/partner/documents/",
    {
      file_data: file.buffer.toString('base64'),
      file_name: file.originalname,
      document_types: ["invoice", "purchase_order"]
    },
    {
      headers: {
        "Content-Type": "application/json",
        "CLIENT-ID": process.env.VERYFI_CLIENT_ID,
        "AUTHORIZATION": `apikey ${process.env.VERYFI_USERNAME}:${process.env.VERYFI_API_KEY}`
      }
    }
  );

  return response.data;
}

module.exports = { classifyDocument };