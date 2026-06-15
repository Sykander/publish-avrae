const { patch } = require('./http-client');

const { getHeaders } = require('./headers');
const { responseData } = require('./response-data');

function collectableUrl(type, id) {
  if (type === 'snippet') {
    return `https://api.avrae.io/workshop/snippet/${id}`;
  }

  return `https://api.avrae.io/workshop/alias/${id}`;
}

async function updateDocs(type, id, collectable) {
  const url = collectableUrl(type, id);
  const payload = {
    name: collectable.name,
    docs: collectable.docs || '',
  };

  const response = await patch(url, payload, { headers: getHeaders() });
  return responseData(response);
}

module.exports = { updateDocs };
