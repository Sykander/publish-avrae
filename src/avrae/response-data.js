function responseData(response) {
  return response?.data?.data ?? response?.data ?? response;
}

function responseId(response) {
  const data = responseData(response);

  return data?.id ?? data?._id ?? data?.key ?? data?.uuid;
}

module.exports = { responseData, responseId };
