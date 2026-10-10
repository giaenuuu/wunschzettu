# syntax=docker/dockerfile:1

# 1. Angular build
FROM node:24-alpine AS web
WORKDIR /web
COPY src/Wunschzettu.Web/package.json src/Wunschzettu.Web/package-lock.json ./
RUN npm ci
COPY src/Wunschzettu.Web/ ./
RUN npx ng build --configuration production

# 2. API publish, with the Angular build as wwwroot
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
# Publishing for the target architecture only keeps one native SkiaSharp library instead of all of them (~500 MB).
ARG TARGETARCH
WORKDIR /src

COPY src/Wunschzettu.Api/Wunschzettu.Api.csproj src/Wunschzettu.Api/
RUN dotnet restore src/Wunschzettu.Api -a $TARGETARCH
COPY src/Wunschzettu.Api/ src/Wunschzettu.Api/
COPY --from=web /web/dist/Wunschzettu.Web/browser/ src/Wunschzettu.Api/wwwroot/
# OpenAPI generation at build time only serves the frontend's type generation; skip it here.
RUN dotnet publish src/Wunschzettu.Api -c Release -a $TARGETARCH -o /app --no-restore -p:OpenApiGenerateDocuments=false

# 3. Runtime: small, non-root. "extra" adds ICU, so mails get localized dates
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra
WORKDIR /app
COPY --from=api /app ./
ENV ASPNETCORE_HTTP_PORTS=8080 \
    App__DataDir=/data
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["dotnet", "Wunschzettu.Api.dll"]
