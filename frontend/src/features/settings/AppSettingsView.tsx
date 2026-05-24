import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { updateSettings } from "@/api/settings";
import type { SettingsRead } from "@/api/types";
import { useI18n } from "@/i18n";

export function AppSettingsView({
  settings,
  onChanged,
}: {
  settings: SettingsRead;
  onChanged: (settings: SettingsRead) => Promise<void> | void;
}) {
  const es = useI18n();

  return (
    <Paper sx={{ p: 2, maxWidth: 680 }}>
      <Stack spacing={2}>
        <Stack spacing={0.75}>
          <Typography sx={{ fontSize: 18, fontWeight: 800 }}>
            {es.appSettings.moneyFormatTitle}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 14 }}>
            {es.appSettings.moneyFormatHint}
          </Typography>
        </Stack>
        <Alert severity="info">{es.appSettings.visualOnlyHint}</Alert>
        <FormControl fullWidth>
          <InputLabel>{es.appSettings.formatMovementsAsLabel}</InputLabel>
          <Select
            label={es.appSettings.formatMovementsAsLabel}
            value={settings.primary_currency_code}
            onChange={(event) => {
              void updateSettings({
                primaryCurrencyCode: event.target.value,
              }).then(onChanged);
            }}
          >
            {settings.currency_formats.map((format) => (
              <MenuItem key={format.code} value={format.code}>
                {format.code} - {format.name} ({format.symbol},{" "}
                {es.appSettings.decimalCount(format.decimal_places)})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
}
