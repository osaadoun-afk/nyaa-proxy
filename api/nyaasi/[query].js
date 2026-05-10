import { handleSearch } from '../_lib/handler.js';

export default function handler(req, res) {
  return handleSearch(req, res, 'https://nyaa.si');
}
