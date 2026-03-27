#!/usr/bin/env pwsh
# sync-widget.ps1
# Após qualquer alteração no ChatWidget, rode este script para:
# 1. Fazer build do widget
# 2. Copiar os arquivos para FagnerTeste/ (site de teste Vercel)
# 3. Commitar e push de ambos os repositórios

$ROOT = "c:\Users\TEC FAG\Music\PROGRAMAÇÃO\PROJETOS\LOCAL\Tecfag I.A Faggner"
$WIDGET_DIR = "$ROOT\VTEXfagner\chat-widget-pro"
$TEST_SITE_DIR = "$ROOT\FagnerTeste"

Write-Host "`n[1/4] Fazendo build do widget..." -ForegroundColor Cyan
Set-Location $WIDGET_DIR
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no build!" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Copiando dist para FagnerTeste..." -ForegroundColor Cyan
Copy-Item "$WIDGET_DIR\dist\tecfag-chat.iife.js" "$TEST_SITE_DIR\tecfag-chat.iife.js" -Force
Copy-Item "$WIDGET_DIR\dist\tecfag-chat.css"     "$TEST_SITE_DIR\tecfag-chat.css"     -Force
Write-Host "  -> Copiado OK" -ForegroundColor Green

Write-Host "`n[3/4] Commitando e publicando widget (chat-widget-pro)..." -ForegroundColor Cyan
Set-Location $WIDGET_DIR
git add -f dist/ src/
git commit -m "build: widget atualizado"
git push

Write-Host "`n[4/4] Commitando e publicando site de teste (FagnerTeste)..." -ForegroundColor Cyan
Set-Location $TEST_SITE_DIR
git add tecfag-chat.iife.js tecfag-chat.css
git commit -m "build: widget sincronizado do chat-widget-pro"
git push

Write-Host "`n✅ Tudo sincronizado! Aguarde 1-2 min para Vercel re-deployar." -ForegroundColor Green
