const configuredApiUrl = process.env.REACT_APP_API_URL;
const API_URL = (
  configuredApiUrl
    ? (/^https?:\/\//i.test(configuredApiUrl) ? configuredApiUrl : `https://${configuredApiUrl}`)
    : 'http://localhost:5000'
).replace(/\/$/, '');

export default API_URL;
