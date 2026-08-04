const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isFileRequest = url.pathname.includes(".");
    if (!isFileRequest) url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    return response;
  },
};

export default worker;
