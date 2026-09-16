require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "gm!";

// Role IDs permitted to use Botmosphere commands.
const ALLOWED_ROLE_IDS = ["1435091261517332512", "1548347060611457215"];

// userId -> stack of { channelId, messageId } for bot messages posted on their behalf.
const userMessages = new Map();

function rememberMessage(userId, message) {
  if (!userMessages.has(userId)) userMessages.set(userId, []);
  userMessages.get(userId).push({
    channelId: message.channelId,
    messageId: message.id,
    content: message.content,
  });
}

function updateStoredContent(userId, messageId, content) {
  const stack = userMessages.get(userId);
  if (!stack) return;
  const entry = stack.find((e) => e.messageId === messageId);
  if (entry) entry.content = content;
}

function removeStoredMessage(userId, messageId) {
  const stack = userMessages.get(userId);
  if (!stack) return;
  const index = stack.findIndex((e) => e.messageId === messageId);
  if (index !== -1) stack.splice(index, 1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag} (ID: ${client.user.id})`);

  try {
    await client.application.commands.set([
      new SlashCommandBuilder()
        .setName("edit")
        .setDescription("Edit one of your Botmosphere messages"),
      new SlashCommandBuilder()
        .setName("delete")
        .setDescription("Delete one of your Botmosphere messages"),
    ]);
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
  /*
  for (const channel of client.channels.cache.values()) {
    if (channel.type === ChannelType.GuildText && channel.name === "general") {
      try {
        await channel.send("I am online");
      } catch {
        // Missing permission to send in this channel; skip it.
      }
    }
  }*/
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  if (!message.member?.roles.cache.hasAny(...ALLOWED_ROLE_IDS)) return;

  const args = message.content.slice(PREFIX.length).trim();
  const spaceIndex = args.indexOf(" ");
  const command = (spaceIndex === -1 ? args : args.slice(0, spaceIndex)).toLowerCase();
  const content = spaceIndex === -1 ? "" : args.slice(spaceIndex + 1);

  if (command === "emote") {
    if (!content.trim()) return;
    await deleteMessage(message);
    const sent = await message.channel.send(content);
    rememberMessage(message.author.id, sent);
    return;
  }

  if (command === "undo") {
    await deleteMessage(message);
    await undoLast(message.author.id);
    return;
  }
});

async function deleteMessage(message) {
  try {
    await message.delete();
  } catch {
    // Message already gone or missing Manage Messages permission; ignore.
  }
}

// Delete the most recent still-existing bot message posted for this user.
async function undoLast(userId) {
  const stack = userMessages.get(userId);
  if (!stack) return;

  while (stack.length > 0) {
    const { channelId, messageId } = stack.pop();
    const channel = client.channels.cache.get(channelId);
    if (!channel) continue;
    try {
      const target = await channel.messages.fetch(messageId);
      await target.delete();
      return;
    } catch {
      // Already deleted or unreachable; try the next one down the stack.
    }
  }
}

// Build an ephemeral select-menu row of the user's past emotes, or null if none.
function buildPanel(userId, type) {
  const stack = userMessages.get(userId);
  if (!stack || stack.length === 0) return null;

  const options = stack
    .slice(-25)
    .reverse()
    .map((entry) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(preview(entry.content))
        .setValue(`${entry.channelId}:${entry.messageId}`)
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${type}select:${userId}`)
    .setPlaceholder(`Select a message to ${type}`)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(menu);
}

// First few words of an emote, for use as a select-menu label (max 100 chars).
function preview(content) {
  const words = content.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  if (!words) return "(empty)";
  return words.length > 100 ? `${words.slice(0, 99)}\u2026` : words;
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const type = interaction.commandName;
    if (type !== "edit" && type !== "delete") return;

    if (!interaction.member?.roles.cache.hasAny(...ALLOWED_ROLE_IDS)) {
      await interaction.reply({
        content: "You don't have permission to use this bot.",
        ephemeral: true,
      });
      return;
    }

    const row = buildPanel(interaction.user.id, type);
    if (!row) {
      await interaction.reply({
        content: `You have no messages to ${type}.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `Which message do you want to ${type}?`,
      components: [row],
      ephemeral: true,
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("deleteselect:")) {
    const ownerId = interaction.customId.split(":")[1];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "This menu isn't yours.", ephemeral: true });
      return;
    }

    const [channelId, targetId] = interaction.values[0].split(":");

    try {
      const channel =
        client.channels.cache.get(channelId) ??
        (await client.channels.fetch(channelId));
      const target = await channel.messages.fetch(targetId);
      await target.delete();
    } catch {
      // Target may already be gone; nothing to do.
    }

    removeStoredMessage(ownerId, targetId);

    // Replace the ephemeral panel with a confirmation only the user can see.
    await interaction.update({ content: "Message deleted.", components: [] });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("editselect:")) {
    const ownerId = interaction.customId.split(":")[1];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "This menu isn't yours.", ephemeral: true });
      return;
    }

    const [channelId, targetId] = interaction.values[0].split(":");

    let current = "";
    try {
      const channel =
        client.channels.cache.get(channelId) ??
        (await client.channels.fetch(channelId));
      const target = await channel.messages.fetch(targetId);
      current = target.content;
    } catch {
      await interaction.reply({
        content: "That message no longer exists.",
        ephemeral: true,
      });
      return;
    }

    const input = new TextInputBuilder()
      .setCustomId("content")
      .setLabel("Message content")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(2000)
      .setRequired(true)
      .setValue(current);

    const modal = new ModalBuilder()
      .setCustomId(`editmodal:${channelId}:${targetId}`)
      .setTitle("Edit message")
      .addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("editmodal:")) {
    const [, channelId, targetId] = interaction.customId.split(":");
    const newContent = interaction.fields.getTextInputValue("content");

    try {
      const channel =
        client.channels.cache.get(channelId) ??
        (await client.channels.fetch(channelId));
      const target = await channel.messages.fetch(targetId);
      await target.edit(newContent);
      updateStoredContent(interaction.user.id, targetId, newContent);
    } catch {
      // Edit target may be gone; nothing to do.
    }

    // Replace the ephemeral panel with a confirmation only the user can see.
    await interaction.update({ content: "Message edited.", components: [] });
  }
});

if (!TOKEN) {
  throw new Error(
    "DISCORD_TOKEN is not set. Copy .env.example to .env and add your bot token."
  );
}

client.login(TOKEN);
