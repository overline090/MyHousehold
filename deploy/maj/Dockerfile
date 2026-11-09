# L'outil de mise à jour, pour une installation Docker : le client Docker
# et Compose, et de quoi lire une page de publications.
FROM docker:27-cli
RUN apk add --no-cache bash curl jq tzdata coreutils sed gzip
COPY myhousehold-maj /usr/local/bin/myhousehold-maj
ENV MH_MODE=docker MH_DONNEES=/data
ENTRYPOINT ["myhousehold-maj"]
