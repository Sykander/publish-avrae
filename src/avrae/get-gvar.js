const { get } = require('axios');
const { getHeaders } = require('./headers');

async function getGvar(id) {
  const { data } = await get(
    `https://api.avrae.io/customizations/gvars/${id}`,
    {
      headers: getHeaders(),
    },
  );

  return data;
}
module.exports = { getGvar };
