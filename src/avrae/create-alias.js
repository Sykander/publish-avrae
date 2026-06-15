const { post } = require('./http-client');

const { getHeaders } = require('./headers');
const { responseData } = require('./response-data');

async function createAlias(collectionId, { name, docs = '' }) {
  const response = await post(
    `https://api.avrae.io/workshop/collection/${collectionId}/alias`,
    { name, docs },
    { headers: getHeaders() },
  );

  return responseData(response);
}

module.exports = { createAlias };
