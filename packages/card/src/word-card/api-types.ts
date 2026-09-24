export type {
  Definition as ApiGloss,
  Entry as ApiEntry,
  Form as ApiForm,
  Sense as ApiSense,
  Tag as ApiTag,
} from "@shirabe-org/api";

import type { Sentence, WordCard } from "@shirabe-org/api";

export type ApiWordDetail = WordCard & {
  dictionary: string;
  sourceId: string;
  name?: boolean;
  examples?: Sentence[];
};

export type ApiPitch = WordCard["pitch"][number];
