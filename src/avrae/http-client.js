async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(method, url, payload, options = {}) {
  const fetchOptions = {
    ...options,
    method,
  };

  if (payload !== undefined) {
    fetchOptions.body = JSON.stringify(payload);
  }

  const response = await fetch(url, fetchOptions);
  const data = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(
      `Request failed with status code ${response.status}`,
    );
    error.response = {
      data,
      status: response.status,
      statusText: response.statusText,
    };
    throw error;
  }

  return { data };
}

function get(url, options) {
  return request('GET', url, undefined, options);
}

function post(url, payload, options) {
  return request('POST', url, payload, options);
}

function put(url, payload, options) {
  return request('PUT', url, payload, options);
}

function patch(url, payload, options) {
  return request('PATCH', url, payload, options);
}

module.exports = {
  get,
  patch,
  post,
  put,
};
