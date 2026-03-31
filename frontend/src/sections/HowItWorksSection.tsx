import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import ModelTrainingRoundedIcon from "@mui/icons-material/ModelTrainingRounded";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import lawfDiagramUrl from "../assets/lawf_sft_probability_diagram.svg";
import { useI18n } from "../i18n";
import type { NavView } from "../types/app";

interface GettingStartedSectionProps {
  onBack: () => void;
  onNavigate: (view: NavView) => void;
}

type DocBlock = {
  subheading: string;
  paragraphs: string[];
};

type DocSection = {
  heading: string;
  paragraphs?: string[];
  blocks?: DocBlock[];
  listItems?: string[];
};

function GettingStartedSection({
  onBack,
  onNavigate,
}: GettingStartedSectionProps) {
  const { t } = useI18n();

  const sections: DocSection[] = [
    {
      heading: t("Introduction"),
      paragraphs: [
        t(
          "It combines dataset management, response correction, training launch, and result tracking in one interface so users can finish the full fine-tuning workflow without writing training scripts.",
        ),
        t(
          "Its core idea is not to rewrite every answer from scratch, but to correct the decisive error positions and keep the rest of the model behavior as stable as possible.",
        ),
      ],
    },
    {
      heading: t("Algorithm principles"),
      blocks: [
        {
          subheading: t("Core mechanism"),
          paragraphs: [
            t(
              "Traditional fine-tuning often asks annotators to rewrite the full answer even when only a few crucial tokens are wrong. That raises labeling cost and makes the model more likely to drift away from capabilities it already had.",
            ),
            t(
              "lawftrack follows a LAwF-style training approach: users mark the key wrong token, provide the correction, and let the system focus learning on the positions that actually change behavior.",
            ),
            t(
              "During training, non-anchor positions keep the base model's target distribution, while the anchor position is explicitly supervised with the human-corrected token.",
            ),
            t(
              "In the diagram above, SFT pushes every aligned position toward the rewritten answer, while LAwF leaves non-anchor positions unchanged and updates only the anchor token.",
            ),
          ],
        },
        {
          subheading: t("How it differs from traditional SFT"),
          paragraphs: [
            t(
              "Traditional SFT asks the model to reproduce the whole target answer. Even when only a small span is wrong, the entire response becomes a training target.",
            ),
            t(
              "That means even tokens that were already acceptable are also pushed toward the rewritten sequence, making the optimization target broader than necessary.",
            ),
            t(
              "It is closer to targeted correction than full-answer rewriting.",
            ),
          ],
        },
        {
          subheading: t("How it differs from pure distillation"),
          paragraphs: [
            t(
              "Pure distillation mainly keeps the model close to a reference distribution. That helps preserve style and stability, but it does not tell the model which behavior should be corrected.",
            ),
            t(
              "lawftrack keeps that distribution-preserving effect on non-anchor positions, then adds human corrections on anchor tokens so the model learns both what should stay unchanged and where it must change.",
            ),
          ],
        },
        {
          subheading: t("How it differs from reinforcement learning"),
          paragraphs: [
            t(
              "Preference optimization and reinforcement learning are useful for more complex alignment problems, but they usually require heavier data construction, more training control, and higher experimentation cost.",
            ),
            t(
              "lawftrack is designed for the lighter case: the model is mostly correct already, but keeps making recurring mistakes at a few key positions.",
            ),
          ],
        },
      ],
    },
    {
      heading: t("Applicable scenarios"),
      paragraphs: [
        t(
          "Because annotation effort is spent only on the positions that really matter, users can iterate faster while keeping more of the base model's original knowledge.",
        ),
      ],
      listItems: [
        t("terminology correction"),
        t("factual error repair"),
        t("format and schema constraints"),
        t("style alignment"),
        t("domain-specific answer adjustment"),
      ],
    },
  ];

  const workflowSteps = [
    t(
      "Create or open a dataset and choose the base model used for generation and training.",
    ),
    t(
      "Generate an answer, inspect the tokenized output, and locate the key error token.",
    ),
    t(
      "Replace the error token, continue generation, and save the corrected sample.",
    ),
    t(
      "Launch a training job after a batch of corrected samples is ready, so the model learns the local corrections instead of relearning every full response.",
    ),
  ];

  return (
    <Stack spacing={2.5}>
      <Box>
        <Button
          startIcon={<ArrowBackRoundedIcon />}
          onClick={onBack}
          sx={{ px: 0 }}
        >
          {t("Back to overview")}
        </Button>
      </Box>

      <Box
        sx={{
          width: "100%",
          borderRadius: 3,
          backgroundColor: "#ffffff",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        }}
      >
        <Stack
          spacing={4}
          sx={{
            px: { xs: 2.5, md: 4.5 },
            py: { xs: 3, md: 4.5 },
            color: "#0f172a",
          }}
        >
          <Stack spacing={1.25}>
            <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.25 }}>
              {t("How it works")}
            </Typography>
          </Stack>

          {sections.map((section, index) => (
            <Stack key={section.heading} spacing={1.5}>
              {index !== 0 ? <Divider /> : null}
              <Typography variant="h5" fontWeight={700}>
                {section.heading}
              </Typography>
              {section.heading === t("Algorithm principles") ? (
                <Box
                  component="img"
                  src={lawfDiagramUrl}
                  alt={t("LAwF algorithm principle diagram")}
                  sx={{
                    width: "100%",
                    display: "block",
                    borderRadius: 2.5,
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                    backgroundColor: "#f8fafc",
                  }}
                />
              ) : null}
              {section.paragraphs?.map((paragraph) => (
                <Typography
                  key={paragraph}
                  variant="body1"
                  sx={{ color: alpha("#0f172a", 0.76), lineHeight: 1.8 }}
                >
                  {paragraph}
                </Typography>
              ))}
              {section.blocks?.map((block) => (
                <Stack key={block.subheading} spacing={1.25} sx={{ pt: 0.5 }}>
                  <Typography variant="h6" fontWeight={700}>
                    {block.subheading}
                  </Typography>
                  {block.paragraphs.map((paragraph) => (
                    <Typography
                      key={paragraph}
                      variant="body1"
                      sx={{ color: alpha("#0f172a", 0.76), lineHeight: 1.8 }}
                    >
                      {paragraph}
                    </Typography>
                  ))}
                </Stack>
              ))}
              {section.listItems ? (
                <Box
                  component="ul"
                  sx={{
                    m: 0,
                    pl: 3,
                    color: alpha("#0f172a", 0.76),
                    "& li": {
                      lineHeight: 1.8,
                      mb: 0.5,
                    },
                  }}
                >
                  {section.listItems.map((item) => (
                    <li key={item}>
                      <Typography
                        component="span"
                        variant="body1"
                        sx={{ color: "inherit" }}
                      >
                        {item}
                      </Typography>
                    </li>
                  ))}
                </Box>
              ) : null}
            </Stack>
          ))}

          <Stack spacing={1.5}>
            <Divider />
            <Typography variant="h5" fontWeight={700}>
              {t("Usage flow")}
            </Typography>
            <Box
              component="ol"
              sx={{
                m: 0,
                pl: 3,
                color: alpha("#0f172a", 0.76),
                "& li": {
                  lineHeight: 1.8,
                  mb: 1,
                },
              }}
            >
              {workflowSteps.map((item) => (
                <li key={item}>
                  <Typography
                    component="span"
                    variant="body1"
                    sx={{ color: "inherit" }}
                  >
                    {item}
                  </Typography>
                </li>
              ))}
            </Box>
          </Stack>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ pt: 0.5 }}
          >
            <Button
              variant="contained"
              startIcon={<DataObjectRoundedIcon />}
              onClick={() => onNavigate("data")}
            >
              {t("Open data workspace")}
            </Button>
            <Button
              variant="outlined"
              startIcon={<ModelTrainingRoundedIcon />}
              onClick={() => onNavigate("training")}
            >
              {t("Open training queue")}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}

export default GettingStartedSection;
