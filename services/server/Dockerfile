FROM node:10 AS build
WORKDIR /srv
ADD package.json .
ADD package-lock.json .
RUN npm ci --production

FROM node:10-slim
COPY --from=build /srv .
ADD . .
EXPOSE 3000
CMD ["node", "index.js"]
