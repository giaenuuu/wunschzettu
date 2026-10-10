#!/usr/bin/env bash
set -euo pipefail

# Named volumes (and their parent dirs) are created root-owned.
sudo chown -R vscode:vscode src/Wunschzettu.Web/node_modules /home/vscode/.nuget

dotnet tool restore
dotnet restore
(cd src/Wunschzettu.Web && npm ci)
