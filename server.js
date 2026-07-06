const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(__dirname + '/public'));

let jogadores = {};
let comidas = [];

const RAIO_MAPA = 3000; 
const COMIDAS_INICIAIS = 1200; 

function gerarPosicaoNoCirculo() {
    let angulo = Math.random() * Math.PI * 2;
    let raio = Math.sqrt(Math.random()) * RAIO_MAPA;
    return {
        x: Math.cos(angulo) * raio,
        y: Math.sin(angulo) * raio
    };
}

function criarCorpoEspacado(posInicial, angulo, tamanho = 15) {
    let corpo = [];
    let espacamento = 7; // Ajustado para a nova velocidade alta
    for (let i = 0; i < tamanho; i++) {
        corpo.push({
            x: posInicial.x - Math.cos(angulo) * (i * espacamento),
            y: posInicial.y - Math.sin(angulo) * (i * espacamento)
        });
    }
    return corpo;
}

for (let i = 0; i < COMIDAS_INICIAIS; i++) {
    comidas.push(gerarPosicaoNoCirculo());
}

io.on('connection', (socket) => {
    console.log(`Nova conexão: ${socket.id}`);

    const pos = gerarPosicaoNoCirculo();
    const anguloInicial = Math.random() * Math.PI * 2;

    // VELOCIDADE TURBINADA: Jogo muito mais rápido e dinâmico
    jogadores[socket.id] = {
        corpo: criarCorpoEspacado(pos, anguloInicial, 15),
        angulo: anguloInicial,
        velocidadeBase: 3.8,  
        velocidadeAtual: 3.8,
        sprintando: false,
        cor: `hsl(${Math.random() * 360}, 100%, 50%)`,
        pontos: 0,
        nome: "Player"
    };

    socket.on('entrarNoJogo', (nomeEscolhido) => {
        if (jogadores[socket.id]) {
            let nomeTratado = nomeEscolhido.trim().substring(0, 16);
            if (!nomeTratado) nomeTratado = `Player_${socket.id.substring(0, 4)}`;
            jogadores[socket.id].nome = nomeTratado;
            socket.emit('configMapa', { RAIO_MAPA });
        }
    });

    socket.on('mudarAngulo', (novoAngulo) => {
        if (jogadores[socket.id]) {
            jogadores[socket.id].angulo = novoAngulo;
        }
    });

    socket.on('definirSprint', (estadoSprint) => {
        const j = jogadores[socket.id];
        if (j) {
            if (estadoSprint && j.pontos > 10) {
                j.sprintando = true;
                j.velocidadeAtual = j.velocidadeBase * 1.8; // Sprint super rápido (~6.8)
            } else {
                j.sprintando = false;
                j.velocidadeAtual = j.velocidadeBase;
            }
        }
    });

    socket.on('disconnect', () => {
        delete jogadores[socket.id];
    });
});

setInterval(() => {
    const ids = Object.keys(jogadores);

    ids.forEach(id => {
        const j = jogadores[id];
        
        if (j.sprintando) {
            if (j.pontos > 5) {
                j.pontos -= 0.15; 
                if (Math.random() < 0.25) {
                    let cauda = j.corpo[j.corpo.length - 1];
                    comidas.push({ x: cauda.x + (Math.random() * 12 - 6), y: cauda.y + (Math.random() * 12 - 6) });
                }
            } else {
                j.sprintando = false;
                j.velocidadeAtual = j.velocidadeBase;
            }
        }

        let novaCabeca = {
            x: j.corpo[0].x + Math.cos(j.angulo) * j.velocidadeAtual,
            y: j.corpo[0].y + Math.sin(j.angulo) * j.velocidadeAtual
        };

        let distanciaOrigem = Math.sqrt(novaCabeca.x ** 2 + novaCabeca.y ** 2);
        if (distanciaOrigem > RAIO_MAPA) {
            let anguloBorda = Math.atan2(novaCabeca.y, novaCabeca.x);
            novaCabeca.x = Math.cos(anguloBorda) * RAIO_MAPA;
            novaCabeca.y = Math.sin(anguloBorda) * RAIO_MAPA;
        }

        j.corpo.unshift(novaCabeca);

        let raioCabeca = 7 + (j.pontos * 0.02);

        for (let i = 0; i < comidas.length; i++) {
            let dx = novaCabeca.x - comidas[i].x;
            let dy = novaCabeca.y - comidas[i].y;
            let distComida = Math.sqrt(dx*dx + dy*dy);

            if (distComida < raioCabeca + 7) {
                if (i < COMIDAS_INICIAIS) {
                    comidas[i] = gerarPosicaoNoCirculo();
                } else {
                    comidas.splice(i, 1);
                }
                j.pontos += 10;
                break;
            }
        }

        let tamanhoMaximoCorpo = 15 + Math.floor(j.pontos / 12);
        while (j.corpo.length > tamanhoMaximoCorpo) {
            j.corpo.pop();
        }
    });

    let mortos = [];
    ids.forEach(id => {
        const j = jogadores[id];
        let cabeca = j.corpo[0];
        let raioCabeca = 7 + (j.pontos * 0.02);

        ids.forEach(outroId => {
            if (id === outroId) return;
            const adversario = jogadores[outroId];
            if (!adversario) return;

            let raioAdversario = 7 + (adversario.pontos * 0.02);

            adversario.corpo.forEach((parte, index) => {
                if (index < 5) return; 

                let dx = cabeca.x - parte.x;
                let dy = cabeca.y - parte.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < (raioCabeca + raioAdversario) * 0.85) {
                    if (!mortos.includes(id)) mortos.push(id);
                }
            });
        });
    });

    mortos.forEach(id => {
        const j = jogadores[id];
        if (j) {
            j.corpo.forEach((parte, idx) => {
                if (idx % 2 === 0) comidas.push({ x: parte.x + (Math.random() * 10 - 5), y: parte.y + (Math.random() * 10 - 5) });
            });

            const pos = gerarPosicaoNoCirculo();
            const anguloInicial = Math.random() * Math.PI * 2;
            j.corpo = criarCorpoEspacado(pos, anguloInicial, 15);
            j.pontos = 0;
            j.angulo = anguloInicial;
            j.sprintando = false;
            j.velocidadeAtual = j.velocidadeBase;
        }
    });

    if (comidas.length > 2500) comidas = comidas.slice(0, COMIDAS_INICIAIS);

    io.emit('atualizarJogo', { jogadores, comidas });
}, 33); // Mantém física estável em background

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Slither rodando na porta ${PORT}`));
