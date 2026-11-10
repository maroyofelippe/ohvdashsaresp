# OHVDashSaresp — imagem da aplicação (Node.js 20 LTS)
FROM node:20-bookworm-slim

ENV TZ=America/Sao_Paulo \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /app

# Dependências primeiro (camada em cache). O postinstall copia o Chart.js para public/vendor.
COPY package.json package-lock.json ./
COPY scripts/copy-vendor.js ./scripts/copy-vendor.js
RUN npm ci && npm cache clean --force

# Código
COPY . .
RUN sed -i 's/\r$//' scripts/docker-entrypoint.sh && chmod +x scripts/docker-entrypoint.sh && chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
