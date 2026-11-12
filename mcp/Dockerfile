FROM node:22-bookworm-slim
WORKDIR /app
COPY mcp/package.json ./
RUN npm install --omit=dev
COPY mcp/*.mjs ./
ENV MCP_PORT=3333
EXPOSE 3333
CMD ["node", "server.mjs", "--http"]
