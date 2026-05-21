import localtunnel from 'localtunnel';

console.log('Abrindo túnel público...');

const tunnel = await localtunnel({ port: 5000 });

console.log('\n✅ Dashboard disponível publicamente em:');
console.log(`\n🌐 ${tunnel.url}\n`);
console.log('Qualquer pessoa com este link pode acessar o dashboard.');
console.log('Para gerar link de cadastro, use este endereço no lugar de localhost.\n');
console.log('⚠️  Mantenha este terminal aberto. Ctrl+C para fechar o túnel.\n');

tunnel.on('close', () => {
  console.log('Túnel fechado.');
  process.exit(0);
});

process.on('SIGINT', () => {
  tunnel.close();
});
