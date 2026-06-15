const { post } = require('axios');

const { getHeaders } = require('./headers');
const { responseData } = require('./response-data');

async function createSnippet(collectionId, { name, docs = '' }) {
  const response = await post(
    `https://api.avrae.io/workshop/collection/${collectionId}/snippet`,
    { name, docs },
    { headers: getHeaders() },
  );

  return responseData(response);
}

module.exports = { createSnippet };
