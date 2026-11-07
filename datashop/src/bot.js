const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits: P } = require('discord.js');
const db = require('./database');
const PREFIX = process.env.PREFIX || '!';
const money = (g,n) => `${g.store.currency || '$'}${Number(n).toFixed(2)}`;
const embed = (g,title,description) => new EmbedBuilder().setColor(g.store.color || '#e11d2e').setTitle(title).setDescription(description || null).setFooter({text:g.store.name || 'DATASHOP'});
const staff = m => m.permissions.has(P.Administrator) || m.permissions.has(P.ManageGuild) || m.roles.cache.some(r => r.id === db.get(m.guild.id).roles.staff || r.id === db.get(m.guild.id).roles.admin || r.id === db.get(m.guild.id).roles.owner);
const tokenize = s => { const a=[]; const re=/"([^"]*)"|'([^']*)'|(\S+)/g; let m; while((m=re.exec(s))) a.push(m[1] ?? m[2] ?? m[3]); return a; };
const mentionId = s => String(s || '').replace(/[<@!>]/g,'');
async function run(message, args) {
  const name=(args.shift() || '').toLowerCase(), g=db.get(message.guild.id), member=message.member;
  const reply=(text,extra={})=>message.reply({content:text,...extra});
  const admin=()=>{ if(!staff(member)){reply('❌ Este comando es solo para el equipo autorizado.');return false;} return true; };
  if(!name) return;
  if(name==='ping') return reply(`🏓 Pong: **${message.client.ws.ping} ms**`);
  if(name==='ayuda' || name==='help') return reply({embeds:[embed(g,'📚 DATASHOP · Comandos',[
    '**General**: `!ping`, `!ayuda`, `!tienda`, `!metodos`, `!userinfo @usuario`, `!serverinfo`, `!sugerencia texto`, `!encuesta pregunta | opción 1 | opción 2`,
    '**Tienda (staff)**: `!producto agregar "Nombre" precio [stock]`, `!producto stock "Nombre" cantidad`, `!producto quitar "Nombre"`, `!venta @cliente monto "producto"`,
    '**Tickets**: `!ticketpanel`, dentro de un ticket `!cerrar`,
    '**Moderación**: `!ban @usuario razón`, `!kick @usuario razón`, `!timeout @usuario 10m razón`, `!clear 20`, `!warn @usuario razón`, `!lock`, `!unlock`,
    '**Administración**: `!say texto`, `!setcanal logs|shop|methods|suggestions|vouches`'
  ].join('\n\n'))]});
  if(name==='tienda' || name==='shop'){
    const products=g.products;
    const desc=products.length ? products.map((p,i)=>`**${i+1}. ${p.emoji || '🛍️'} ${p.name}** — ${money(g,p.price)} · Stock: ${p.stock < 0 ? 'Ilimitado' : p.stock}${p.description ? '\n'+p.description : ''}`).join('\n\n') : 'Todavía no hay productos publicados. Vuelve pronto.';
    return reply({embeds:[embed(g,`🛒 ${g.store.name}`,desc)]});
  }
  if(name==='metodos'){
    const desc=g.methods.length ? g.methods.map(x=>`**${x.name}**\n${x.detail}`).join('\n\n') : 'Los métodos de pago aún no están configurados.';
    return reply({embeds:[embed(g,'🏦 Métodos de pago',desc)]});
  }
  if(name==='producto'){
    if(!admin()) return;
    const action=(args.shift()||'').toLowerCase(), productName=args.shift();
    if(action==='agregar'){
      const price=Number(args.shift()), stockRaw=args.shift(), stock=stockRaw===undefined?-1:Number(stockRaw);
      if(!productName || !Number.isFinite(price) || price<0 || !Number.isInteger(stock) || stock < -1) return reply('Uso: `!producto agregar "Nombre" precio [stock]`');
      const id=productName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      let p=g.products.find(x=>x.id===id);
      if(!p){ if(g.products.length>=25)return reply('❌ Límite de 25 productos.'); p={id,name:productName,price,stock,emoji:'🛍️',description:''};g.products.push(p); }
      Object.assign(p,{name:productName,price,stock});db.save(message.guild.id);return reply(`✅ Producto **${productName}** guardado por ${money(g,price)}.`);
    }
    const p=g.products.find(x=>x.id===productName || x.name.toLowerCase()===String(productName).toLowerCase());
    if(!p)return reply('❌ Producto no encontrado. Usa el nombre entre comillas si contiene espacios.');
    if(action==='stock'){const n=Number(args.shift());if(!Number.isInteger(n)||n < -1)return reply('Uso: `!producto stock "Nombre" cantidad` (usa -1 para ilimitado).');p.stock=n;db.save(message.guild.id);return reply(`✅ Stock actualizado: ${n<0?'ilimitado':n}.`);}
    if(action==='quitar'){g.products.splice(g.products.indexOf(p),1);db.save(message.guild.id);return reply('🗑️ Producto eliminado.');}
    return reply('Acciones: `!producto agregar`, `!producto stock`, `!producto quitar`.');
  }
  if(name==='venta'){
    if(!admin())return;const user=message.mentions.users.first(),amount=Number(args[1]);const productName=args.slice(2).join(' ').replace(/^['\"]|['\"]$/g,'');
    if(!user || !Number.isFinite(amount) || amount<=0)return reply('Uso: `!venta @cliente monto "producto"`');
    const c=g.customers[user.id] ||= {spent:0,orders:0};c.spent=Math.round((c.spent+amount)*100)/100;c.orders++;g.sales++;
    const p=g.products.find(x=>x.name.toLowerCase()===productName.replace(/^["']|["']$/g,'').toLowerCase());if(p&&p.stock>0)p.stock--;
    db.save(message.guild.id);const ch=g.channels.ventas&&message.guild.channels.cache.get(g.channels.ventas);if(ch)ch.send({embeds:[embed(g,'💸 Nueva venta',`Cliente: ${user}\nMonto: **${money(g,amount)}**\nProducto: ${productName||'No especificado'}`)]}).catch(()=>{});
    return reply(`✅ Venta registrada para ${user}: ${money(g,amount)}.`);
  }
  if(name==='metodo'){
    if(!admin())return;const action=(args.shift()||'').toLowerCase(),methodName=args.shift();
    if(action==='agregar'){const detail=args.join(' ');if(!methodName||!detail)return reply('Uso: !metodo agregar "Nombre" "Detalles"');const old=g.methods.find(x=>x.name.toLowerCase()===methodName.toLowerCase());if(old)old.detail=detail;else g.methods.push({name:methodName,detail});db.save(message.guild.id);return reply('✅ Método de pago guardado.');}
    if(action==='quitar'){const index=g.methods.findIndex(x=>x.name.toLowerCase()===String(methodName).toLowerCase());if(index<0)return reply('❌ Método no encontrado.');g.methods.splice(index,1);db.save(message.guild.id);return reply('🗑️ Método eliminado.');}
    return reply('Usa !metodo agregar o !metodo quitar.');
  }
  if(name==='ticketpanel'){
    if(!admin())return;const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ds:ticket').setLabel('Abrir ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary));
    return message.channel.send({embeds:[embed(g,g.ticket.panelTitle || '🎫 Soporte',g.ticket.panelDesc || 'Pulsa el botón para abrir un ticket.')],components:[row]});
  }
  if(name==='cerrar'){
    const channel=message.channel, owner=channel.topic?.match(/DATASHOP_OWNER=(\d+)/)?.[1];
    if(!owner)return reply('❌ Este canal no parece ser un ticket DATASHOP.');
    if(owner!==message.author.id&&!staff(member))return reply('❌ Solo el autor del ticket o el staff puede cerrarlo.');
    await reply('🔒 Ticket cerrado.');return channel.permissionOverwrites.edit(message.guild.roles.everyone,{ViewChannel:false}).catch(()=>{});
  }
  if(name==='setcanal'){
    if(!admin())return;const key=(args.shift()||'').toLowerCase();if(!['logs','shop','methods','suggestions','vouches','ventas','tickets'].includes(key))return reply('Canales: logs, shop, methods, suggestions, vouches, ventas, tickets.');
    g.channels[key]=message.channel.id;db.save(message.guild.id);return reply(`✅ Canal ${key} configurado en ${message.channel}.`);
  }
  if(name==='say'){if(!admin())return;const text=args.join(' ');if(!text)return reply('Uso: !say mensaje');await message.delete().catch(()=>{});return message.channel.send({content:text,allowedMentions:{parse:[]}});}
  if(name==='sugerencia'){
    const text=args.join(' ');if(!text)return reply('Escribe tu sugerencia después del comando.');
    const ch=g.channels.suggestions&&message.guild.channels.cache.get(g.channels.suggestions)||message.channel;
    const sent=await ch.send({embeds:[embed(g,'💡 Nueva sugerencia',text+'\n\nEnviada por '+message.author)]});await sent.react('👍').catch(()=>{});await sent.react('👎').catch(()=>{});return reply('✅ Sugerencia enviada.');
  }
  if(name==='warn'||name==='ban'||name==='kick'||name==='timeout'){
    if(!admin())return;const user=message.mentions.users.first();if(!user)return reply(`Uso: !${name} @usuario razón`);
    const target=await message.guild.members.fetch(user.id).catch(()=>null),reason=args.slice(1).join(' ')||'Sin razón';
    if(name==='warn'){(g.warns[user.id] ||= []).push({by:message.author.id,reason,at:Date.now()});db.save(message.guild.id);return reply(`⚠️ Advertencia registrada para ${user.tag}.`);}
    if(!target)return reply('❌ No encontré al miembro en este servidor.');
    if(name==='ban'){if(!target.bannable)return reply('❌ No puedo banear a ese usuario por jerarquía o permisos.');await target.ban({reason});return reply(`🔨 ${user.tag} fue baneado.`);}
    if(name==='kick'){if(!target.kickable)return reply('❌ No puedo expulsar a ese usuario.');await target.kick(reason);return reply(`👢 ${user.tag} fue expulsado.`);}
    const duration=args[1]||'10m',match=duration.match(/^(\d+)(m|h|d)$/i);if(!match)return reply('Duración válida: 10m, 2h o 1d.');const ms=Number(match[1])*({m:60000,h:3600000,d:86400000}[match[2].toLowerCase()]);if(ms>28*86400000)return reply('El máximo es 28 días.');await target.timeout(ms,reason);return reply(`🔇 ${user.tag} recibió timeout por ${duration}.`);
  }
  if(name==='clear'){if(!admin())return;const n=Number(args[0]);if(!Number.isInteger(n)||n<1||n>100)return reply('Uso: !clear 1-100');const deleted=await message.channel.bulkDelete(n,true).catch(()=>null);return reply(deleted?`🧹 ${deleted.size} mensajes eliminados.`:'❌ No pude borrar esos mensajes.');}
  if(name==='lock'||name==='unlock'){if(!admin())return;await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:name==='lock'?false:null});return reply(name==='lock'?'🔒 Canal bloqueado.':'🔓 Canal desbloqueado.');}
  if(name==='userinfo'){const u=message.mentions.users.first()||message.author;return reply({embeds:[embed(g,`👤 ${u.tag}`,`ID: ${u.id}\nCuenta creada: <t:${Math.floor(u.createdTimestamp/1000)}:R>`)]});}
  if(name==='serverinfo')return reply({embeds:[embed(g,guildName(message.guild),`Miembros: ${message.guild.memberCount}\nCanales: ${message.guild.channels.cache.size}\nVentas: ${g.sales}`)]});
  if(name==='encuesta'){const raw=args.join(' ').split('|').map(x=>x.trim()).filter(Boolean);if(raw.length<3)return reply('Uso: !encuesta pregunta | opción 1 | opción 2');const q=raw.shift();const m=await message.channel.send({embeds:[embed(g,'📊 '+q,raw.map((x,i)=>['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][i]+' '+x).join('\n'))]});for(const e of ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'].slice(0,raw.length))await m.react(e).catch(()=>{});return;}
}
function guildName(g){return g.name;}
module.exports = client => {
  client.once(Events.ClientReady,()=>{console.log('DATASHOP conectado como '+client.user.tag);client.user.setActivity('!ayuda | DATASHOP');});
  client.on(Events.MessageCreate,async message=>{
    if(!message.guild||message.author.bot||!message.content.startsWith(PREFIX))return;
    const args=tokenize(message.content.slice(PREFIX.length).trim());
    try{await run(message,args);}catch(error){console.error('Comando DATASHOP:',error);message.reply('❌ Error al ejecutar el comando.').catch(()=>{});}
  });
  client.on(Events.InteractionCreate,async interaction=>{
    if(!interaction.isButton()||interaction.customId!=='ds:ticket'||!interaction.guild)return;
    const guild=interaction.guild,g=db.get(guild.id),existing=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.topic===`DATASHOP_OWNER=${interaction.user.id}`);
    if(existing)return interaction.reply({content:`Ya tienes un ticket abierto: ${existing}`,ephemeral:true});
    const category=g.channels.ticketCategory&&guild.channels.cache.get(g.channels.ticketCategory);
    const channel=await guild.channels.create({name:`ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,90),type:ChannelType.GuildText,parent:category?.id,topic:`DATASHOP_OWNER=${interaction.user.id}`,permissionOverwrites:[{id:guild.roles.everyone,deny:[P.ViewChannel]},{id:interaction.user.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory]},{id:client.user.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.ManageChannels]}]});
    await channel.send({content:`${interaction.user}`,embeds:[embed(g,'🎫 Ticket abierto','Describe tu solicitud. El equipo de soporte te atenderá pronto.')]});
    return interaction.reply({content:`✅ Ticket creado: ${channel}`,ephemeral:true});
  });
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{try{db.close();}catch{}});
};
