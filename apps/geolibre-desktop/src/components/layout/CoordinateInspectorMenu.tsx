import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@geolibre/ui";
import { Crosshair } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  automaticUtm,
  formatInspectorXY,
  INSPECTOR_SYSTEMS,
  isValidPosition,
  transformPosition,
  type CoordinateResult,
} from "../../lib/coordinate-inspector";

export function CoordinateInspectorMenu({
  lng,
  lat,
  onCopy,
}: {
  lng: number;
  lat: number;
  onCopy: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ReadonlyMap<number, CoordinateResult>>();
  const auto = automaticUtm(lng, lat);
  const autoCode = auto?.code;
  const valid = isValidPosition(lng, lat);

  useEffect(() => {
    if (!open || results || !valid) return;
    let cancelled = false;
    const codes = new Set<number>(INSPECTOR_SYSTEMS.map(({ code }) => code));
    if (autoCode !== undefined) codes.add(autoCode);
    void Promise.all(
      Array.from(codes, async (code) => [code, await transformPosition(lng, lat, code)] as const),
    ).then((entries) => {
      if (!cancelled) setResults(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [open, results, valid, lng, lat, autoCode]);

  function renderSystem(code: number, name: string, automatic = false) {
    const result = results?.get(code);
    const values = result?.status === "ok" ? formatInspectorXY(result.xy, code) : undefined;
    const unit = code === 4326 ? "°" : " m";
    const approximate = code === 25832 || code === 25833;

    return (
      <DropdownMenuItem
        key={code}
        disabled={!values}
        onSelect={values ? () => onCopy(values.join(", ")) : undefined}
        className="group block whitespace-normal break-words"
      >
        <span className={automatic ? "block font-semibold" : "block"}>{name}</span>
        <span className="block text-xs">EPSG:{code}</span>
        {values ? (
          <span className="flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground group-data-highlighted:font-semibold group-data-highlighted:text-accent-foreground">
            <span>
              X {values[0]}
              {unit}
            </span>
            <span>
              Y {values[1]}
              {unit}
            </span>
          </span>
        ) : result && result.status !== "ok" ? (
          <span className="block text-xs">
            {t(`mapContextMenu.coordinateInspector.${result.status}`)}
          </span>
        ) : null}
        {values && approximate ? (
          <span className="block text-xs">
            {t("mapContextMenu.coordinateInspector.approximate")}
          </span>
        ) : null}
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuSub open={open} onOpenChange={setOpen}>
      <DropdownMenuSubTrigger>
        <Crosshair className="h-4 w-4 shrink-0 text-muted-foreground" />
        {t("mapContextMenu.coordinateInspector.label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72" collisionPadding={8}>
        {!valid ? (
          <DropdownMenuLabel>
            {t("mapContextMenu.coordinateInspector.invalidPoint")}
          </DropdownMenuLabel>
        ) : !results ? (
          <DropdownMenuLabel role="status">
            {t("mapContextMenu.coordinateInspector.loading")}
          </DropdownMenuLabel>
        ) : (
          <>
            {auto ? (
              renderSystem(
                auto.code,
                t("mapContextMenu.coordinateInspector.automatic", {
                  zone: `${auto.zone}${auto.hemisphere}`,
                }),
                true,
              )
            ) : (
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("mapContextMenu.coordinateInspector.noUtm")}
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            {INSPECTOR_SYSTEMS.map(({ code, name }) => renderSystem(code, name))}
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
