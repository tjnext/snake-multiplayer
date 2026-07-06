const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permite conexões de fora quando estiver hospedado online
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname + '/public'));

let jogadores = {};
let comidas = [];
const LARGURA_GRADE = 40; 
const ALTURA_GRADE = 30;  
const COMIDAS_INICIAIS = 25; 

function gerarPosicaoAleatoria() {
    return {
        x: Math.floor(Math.random() * LARGURA_GRADE),
        y: Math.floor(Math.random() * ALTURA_GRADE)
    };
}

for (let i = 0; i < COMIDAS_INICIAIS; i++) {
    comidas.push(gerarPosicaoAleatoria());
}

io.on('connection', (socket) => {
    console.log(`Nova tentativa de conexão: ${socket.id}`);

    // Cria a estrutura básica do jogador pendente esperando o nome
    const posInicial = gerarPosicaoAleatoria();
    jogadores[socket.id] = {
        corpo: [{ x: posInicial.x, y: posInicial.y }],
        dx: 0,
        dy: 0,
        cor: `hsl(${Math.random() * 360}, 100%, 50%)`, // Garante cores bem diferentes e vivas
        pontos: 0,
        nome: "Player"
    };

    // Escuta o evento de login com o nome escolhido
    socket.on('entrarNoJogo', (nomeEscolhido) => {
        if (jogadores[socket.id]) {
            // Garante que o nome tenha no máximo 20 caracteres e limpa espaços extras
            let nomeTratado = nomeEscolhido.trim().substring(0, 20);
            if (!nomeTratado) nomeTratado = `Player_${socket.id.substring(0, 4)}`;
            
            jogadores[socket.id].nome = nomeTratado;
            
            // Envia o estado do jogo apenas após o jogador estar devidamente nomeado
            socket.emit('atualizarJogo', { jogadores, comidas });
        }
    });

    socket.on('mudarDirecao', (direcao) => {
        const jogador = jogadores[socket.id];
        if (!jogador) return;

        if (direcao === 'ESQUERDA' && jogador.dx !== 1) { jogador.dx = -1; jogador.dy = 0; }
        if (direcao === 'DIREITA' && jogador.dx !== -1) { jogador.dx = 1; jogador.dy = 0; }
        if (direcao === 'CIMA' && jogador.dy !== 1) { jogador.dx = 0; jogador.dy = -1; }
        if (direcao === 'BAIXO' && jogador.dy !== -1) { jogador.dx = 0; jogador.dy = 1; }
    });

    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        delete jogadores[socket.id];
        io.emit('atualizarJogo', { jogadores, comidas });
    });
});

// Loop principal do jogo (100ms)
setInterval(() => {
    const ids = Object.keys(jogadores);

    // 1. Movimentação
    ids.forEach(id => {
        const jogador = jogadores[id];
        if (jogador.dx === 0 && jogador.dy === 0) return; // <-- Corrigido aqui (estava _jogador.dy)

        const cabeca = { 
            x: jogador.corpo[0].x + jogador.dx, // <-- Corrigido aqui (estava _jogador.dx)
            y: jogador.corpo[0].y + jogador.dy  // <-- Corrigido aqui (estava _jogador.corpo[0].y e _jogador.dy)
        };

        if (cabeca.x < 0) cabeca.x = LARGURA_GRADE - 1;
        if (cabeca.x >= LARGURA_GRADE) cabeca.x = 0;
        if (cabeca.y < 0) cabeca.y = ALTURA_GRADE - 1;
        if (cabeca.y >= ALTURA_GRADE) cabeca.y = 0;

        jogador.corpo.unshift(cabeca);

        let comeu = false;
        for (let i = 0; i < comidas.length; i++) {
            if (cabeca.x === comidas[i].x && cabeca.y === comidas[i].y) {
                if (i < COMIDAS_INICIAIS) {
                    comidas[i] = gerarPosicaoAleatoria();
                } else {
                    comidas.splice(i, 1);
                }
                jogador.pontos += 10;
                comeu = true;
                break;
            }
        }

        if (!comeu) {
            jogador.corpo.pop();
        }
    });

    // 2. Colisão Seletiva (Slither.io)
    let jogadoresParaEliminar = [];
    ids.forEach(id => {
        const jogador = jogadores[id];
        if (jogador.dx === 0 && jogador.dy === 0) return; // <-- Corrigido aqui (estava _jogador.dy)

        const cabeca = jogador.corpo[0]; // <-- Corrigido aqui (estava _jogador.corpo[0])

        ids.forEach(outroId => {
            if (id === outroId) return; // Não morre batendo em si mesmo

            const adversario = jogadores[outroId];
            adversario.corpo.forEach(parte => {
                if (cabeca.x === parte.x && cabeca.y === parte.y) {
                    if (!jogadoresParaEliminar.includes(id)) {
                        jogadoresParaEliminar.push(id);
                    }
                }
            });
        });
    });

    // Processa mortes e transforma em comida
    jogadoresParaEliminar.forEach(id => {
        const jogador = jogadores[id];
        if (jogador) {
            jogador.corpo.forEach(parte => {
                comidas.push({ x: parte.x, y: parte.y });
            });

            const pos = gerarPosicaoAleatoria();
            jogador.corpo = [{ x: pos.x, y: pos.y }];
            jogador.dx = 0;
            jogador.dy = 0;
            jogador.pontos = 0;
        }
    });

    if (comidas.length > 150) {
        comidas = comidas.slice(0, COMIDAS_INICIAIS);
    }

    io.emit('atualizarJogo', { jogadores, comidas });
}, 100);

// Usa a porta padrão do ambiente (necessário para o Render/Hospedagens online) ou a 3000 local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});