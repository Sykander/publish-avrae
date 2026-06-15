const { get } = require('axios');
const { getHeaders } = require('./headers');

async function getWorkshop(id) {
  const {
    data: { data },
  } = await get(`https://api.avrae.io/workshop/collection/${id}/full`, {
    headers: getHeaders(),
  });

  return data;
}

module.exports = { getWorkshop };
