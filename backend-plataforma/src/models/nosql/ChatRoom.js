const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: [true, 'El senderId es obligatorio'],
      trim: true,
    },
    senderName: {
      type: String,
      required: [true, 'El senderName es obligatorio'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'El contenido del mensaje es obligatorio'],
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatRoomSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: [true, 'El projectId es obligatorio'],
      unique: true,
      index: true,
      trim: true,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    canvasStateSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const ChatRoom =
  mongoose.models.ChatRoom || mongoose.model('ChatRoom', chatRoomSchema);

module.exports = {
  messageSchema,
  chatRoomSchema,
  ChatRoom,
};

