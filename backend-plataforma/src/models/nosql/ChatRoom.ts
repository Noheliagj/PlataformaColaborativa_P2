import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IMessage {
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
}

export interface IChatRoom extends Document {
  projectId: string;
  messages: IMessage[];
  canvasStateSnapshot: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export const messageSchema = new Schema<IMessage>(
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
  { _id: false },
);

export const chatRoomSchema = new Schema<IChatRoom>(
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
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

export const ChatRoom: Model<IChatRoom> =
  mongoose.models.ChatRoom || mongoose.model<IChatRoom>('ChatRoom', chatRoomSchema);

export default ChatRoom;

