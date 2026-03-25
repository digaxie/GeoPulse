FROM node:20-alpine

WORKDIR /app

# Sadece relay için gereken bağımlılıkları yükle
RUN npm init -y && npm install ws @supabase/supabase-js

COPY scripts/tzevaadom-relay.cjs ./relay.cjs

EXPOSE 8080

CMD ["node", "relay.cjs"]
