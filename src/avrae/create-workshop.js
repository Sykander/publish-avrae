const { post } = require('axios');

const { getHeaders } = require('./headers');
const { responseData } = require('./response-data');

async function createWorkshop({ name, description = '', image = '' }) {
  const response = await post(
    'https://api.avrae.io/workshop/collection',
    { name, description, image },
    { headers: getHeaders() },
  );

  return responseData(response);
}

module.exports = { createWorkshop };
