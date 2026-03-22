import { Box, Card, CardContent, Grid, Paper, Stack, Typography } from "@mui/material";
import PlayCircleOutlineRoundedIcon from "@mui/icons-material/PlayCircleOutlineRounded";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import { useI18n } from "../i18n";
import type { CommandItem, ServiceRecord } from "../types/app";

interface ServiceSectionProps {
  commands: CommandItem[];
  records: ServiceRecord[];
}

function ServiceSection({ commands, records }: ServiceSectionProps) {
  const { t } = useI18n();

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, lg: 7 }}>
        <Card>
          <CardContent>
            <Typography variant="h6">{t("Service details")}</Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {records.map((record) => (
                <Paper key={record.label} elevation={0} sx={{ p: 2, borderRadius: 3, border: "1px solid rgba(15, 23, 42, 0.08)" }}>
                  <Typography variant="overline" color="text.secondary">
                    {record.label}
                  </Typography>
                  <Typography variant="body1" sx={{ mt: 0.5, wordBreak: "break-word" }}>
                    {record.value}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 5 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Typography variant="h6">{t("Common commands")}</Typography>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {commands.map((command) => (
                <Paper key={command.value} elevation={0} sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, borderRadius: 3, border: "1px solid rgba(15, 23, 42, 0.08)" }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <TerminalRoundedIcon color="primary" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {command.label}
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 0.25, fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace' }}>
                        {command.value}
                      </Typography>
                    </Box>
                  </Stack>
                  <PlayCircleOutlineRoundedIcon color="action" />
                </Paper>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

export default ServiceSection;
