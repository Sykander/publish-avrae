const { post } = require('axios');
const { getHeaders } = require('./headers');

async function updateGvar(id, content) {
  return post(`https://api.avrae.io/customizations/gvars/${id}`, content, {
    headers: getHeaders(),
  });
}

module.exports = { updateGvar };
