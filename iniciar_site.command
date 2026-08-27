podemo#!/bin/bash
# Abre o painel PPMAC localmente. Da' dois cliques neste arquivo no Finder
# (ou rode "bash iniciar_site.command" no Terminal) sempre que quiser ver
# o site rodando no seu computador.

cd "$(dirname "$0")/site" || exit 1

PORT=8080

# se a porta ja estiver em uso (por um servidor anterior), so abre o navegador
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Servidor ja estava rodando na porta $PORT."
else
  echo "Iniciando servidor local na porta $PORT..."
  python3 -m http.server "$PORT" &
  sleep 1
fi

open "http://localhost:$PORT/"

echo ""
echo "Site aberto em http://localhost:$PORT/"
echo "Deixe esta janela aberta enquanto estiver usando o site."
echo "Para encerrar o servidor, feche esta janela ou aperte Ctrl+C."
echo ""

wait
