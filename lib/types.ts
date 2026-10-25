export type BusinessProfile = {
  name: string;
  industry: string;
  description: string;
  audience: string;
  tone: string;
  offer: string;
  faq: string;
  knowledge: string;
  updatedAt: string;
};

export type Agent = {
  id: string;
  name: string;
  emoji: string;
  role: string;
  goal: string;
  instructions: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  business: BusinessProfile;
  agents: Agent[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
