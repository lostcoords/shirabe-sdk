export type {
  Definition as ApiGloss,
  Entry as ApiEntry,
  Form as ApiForm,
  Sense as ApiSense,
  Tag as ApiTag,
  WordDetail as ApiWordDetail,
} from "@shirabe-org/api";

import type { WordDetail } from "@shirabe-org/api";

export type ApiPitch = WordDetail["pitch"][number];
