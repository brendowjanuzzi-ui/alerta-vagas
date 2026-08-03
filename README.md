# 📍 Alerta Vagas

> 🌐 **Acesse o projeto aqui:** [https://brendowjanuzzi-ui.github.io/alerta-vagas/](https://brendowjanuzzi-ui.github.io/alerta-vagas/)

Uma plataforma inteligente de busca de empregos baseada em geolocalização, conectando candidatos a oportunidades locais em tempo real.

![Capa do Projeto](capa.png)

## 🚀 Diferenciais do Projeto
- **Busca por Raio**: defina a distância máxima e encontre vagas próximas de casa.
- **Mapa Interativo**: integração com **Leaflet** para visualização precisa dos pins.
- **Filtros Avançados**: busca por texto, filtro por tipo de contratação (CLT, PJ, Estágio...) e ordenação (distância, recentes, salário).
- **Detalhes da Vaga**: cargo, empresa, salário, descrição e contato.
- **Candidatura Direta**: aplique-se a uma vaga com um toque, via **WhatsApp**.
- **Mini Currículo**: o candidato monta seu currículo (nome, área, escolaridade, contato, experiência) e o resumo vai automático na mensagem de candidatura. Salvo no aparelho (offline) e sincronizado com a conta quando logado.
- **Dois Perfis**: candidatos buscam vagas; empresas anunciam tocando no mapa e gerenciam suas próprias vagas.
- **PWA Instalável**: funciona offline (app shell em cache) e pode ser instalado no celular.

## 🛠 Stack Técnica
- **Front-end**: HTML5, CSS3 e JavaScript modular (ES Modules).
- **Mapas**: Leaflet.js com tiles Carto (gratuitos, sem chave).
- **Backend/Database**: Firebase (Firestore + Authentication, incluindo Google, Apple e Telefone/SMS).

## 📁 Estrutura
```
index.html      # Estrutura e marcação
styles.css      # Estilos (mobile-first + layout desktop)
app.js          # Lógica do app (mapa, auth, vagas, filtros)
sw.js           # Service Worker (offline / PWA)
manifest.json   # Configuração do app instalável
icon-192.png    # Ícone do app
icon-512.png    # Ícone do app (alta resolução)
```

## 🧠 Objetivo do Projeto
Reduzir o tempo de deslocamento dos trabalhadores e facilitar a conexão entre pequenas empresas locais e talentos da região, utilizando tecnologia de mapas para otimizar a busca por emprego.

## 🔧 Notas técnicas
- O mapa é inicializado na carga da página (independente do login), garantindo que sempre apareça.
- Se o Firestore não tiver vagas (ou estiver indisponível), o app mostra **vagas de exemplo** claramente identificadas, para que a experiência nunca fique vazia.
- Os filtros (raio, tipo, busca, ordenação) operam sobre a lista e o mapa em tempo real.
