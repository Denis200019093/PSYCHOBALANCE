'use client';
import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ipc } from '@/lib/ipc/client';
import {
  DEFAULT_ZONES,
  DEFAULT_ZONE_VIDEOS,
  isDefaultZoneShape,
  type AppSettings,
  type ZoneConfig,
  type ZoneTemplate,
} from '@shared/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button, buttonVariants } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UpdateIndicator } from '@/components/UpdateIndicator';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ConfirmReq {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    ipc.getSettings().then((s) => active && setSettings(s));
    const unsub = ipc.onSettingsChange(setSettings);
    return () => {
      active = false;
      unsub();
    };
  }, [open]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // In-app confirm instead of window.confirm: native modal dialogs steal focus
  // from / freeze the Radix dialog (inputs become unclickable afterwards).
  // askConfirm resolves true/false when the AlertDialog is answered.
  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);
  const askConfirm = (opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> =>
    new Promise((resolve) => setConfirmReq({ ...opts, resolve }));
  const answerConfirm = (ok: boolean) => {
    confirmReq?.resolve(ok); // idempotent: promise keeps its first settled value
    setConfirmReq(null);
  };

  // Each accordion item edits its own template (the open one need not be the
  // active one). Zone ops take the target template id, compute the next zone
  // list, then write it back — the other templates are untouched.
  const zonesOf = (templateId: string): ZoneConfig[] =>
    settings?.templates.find((t) => t.id === templateId)?.zones ?? [];

  const writeZones = async (templateId: string, next: ZoneConfig[]): Promise<void> => {
    if (!settings) return;
    const templates = settings.templates.map((t) =>
      t.id === templateId ? { ...t, zones: next } : t,
    );
    setSettings(await ipc.updateSettings({ templates }));
  };

  const updateZone = async (templateId: string, id: string, patch: Partial<ZoneConfig>) => {
    await writeZones(templateId, zonesOf(templateId).map((z) => (z.id === id ? { ...z, ...patch } : z)));
  };

  const pickVideo = async (templateId: string, id: string) => {
    const path = await ipc.pickVideo();
    if (path) await updateZone(templateId, id, { videoPath: path });
  };

  const deleteZone = async (templateId: string, id: string) => {
    const z = zonesOf(templateId).find((x) => x.id === id);
    if (!z) return;
    if (!(await askConfirm({ title: `Видалити зону «${z.label}»?`, destructive: true, confirmLabel: 'Видалити' }))) return;
    await writeZones(templateId, zonesOf(templateId).filter((x) => x.id !== id));
  };

  const resetVideos = async (templateId: string) => {
    if (!(await askConfirm({
      title: 'Скинути відео?',
      description: 'Відео всіх дефолтних зон повернуться до стандартних URL.',
      confirmLabel: 'Скинути',
    }))) return;
    await writeZones(
      templateId,
      zonesOf(templateId).map((z) =>
        DEFAULT_ZONE_VIDEOS[z.id] ? { ...z, videoPath: DEFAULT_ZONE_VIDEOS[z.id] as string } : z,
      ),
    );
  };

  const resetZones = async (templateId: string) => {
    if (!(await askConfirm({
      title: 'Скинути зони до дефолтних?',
      description: 'Зони повернуться до Низька / Середня / Висока. Кастомні зони буде видалено.',
      destructive: true,
      confirmLabel: 'Скинути',
    }))) return;
    await writeZones(templateId, DEFAULT_ZONES.map((z) => ({ ...z })));
  };

  const addZone = async (templateId: string) => {
    const cur = zonesOf(templateId);
    const lastMax = cur.reduce((m, z) => Math.max(m, z.maxHr), 0);
    const minHr = Number.isFinite(lastMax) ? lastMax : 0;
    const newZone: ZoneConfig = {
      id: newZoneId(),
      label: 'Нова зона',
      color: '#7a7a7a',
      minHr,
      maxHr: minHr + 10,
      videoPath: '',
      fadeMs: 1500,
    };
    await writeZones(templateId, [...cur, newZone]);
  };

  const onZoneDragEnd = async (templateId: string, e: DragEndEvent) => {
    if (!settings) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const cur = zonesOf(templateId);
    const oldIdx = cur.findIndex((z) => z.id === active.id);
    const newIdx = cur.findIndex((z) => z.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(cur, oldIdx, newIdx);
    const templates = settings.templates.map((t) =>
      t.id === templateId ? { ...t, zones: next } : t,
    );
    setSettings({ ...settings, templates }); // optimistic — avoid drag snap-back
    await ipc.updateSettings({ templates });
  };

  // --- Template ops ----------------------------------------------------------
  const rand = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newTemplateId = () => `tpl-${rand()}`;
  const newZoneId = () => `custom-${rand()}`;

  // Radio is the single authority over which template is active (drives video).
  const selectTemplate = async (id: string) => {
    if (!settings || id === settings.activeTemplateId) return;
    setSettings(await ipc.updateSettings({ activeTemplateId: id }));
  };

  // Add / duplicate never change the active template — that stays a radio choice.
  const addTemplate = async () => {
    if (!settings) return;
    const tpl: ZoneTemplate = {
      id: newTemplateId(),
      name: `Шаблон ${settings.templates.length + 1}`,
      zones: DEFAULT_ZONES.map((z) => ({ ...z })),
    };
    setSettings(await ipc.updateSettings({ templates: [...settings.templates, tpl] }));
  };

  const duplicateTemplate = async (templateId: string) => {
    if (!settings) return;
    const src = settings.templates.find((t) => t.id === templateId);
    if (!src) return;
    const tpl: ZoneTemplate = {
      id: newTemplateId(),
      name: `${src.name} (копія)`,
      // Fresh zone ids so the copy never shares ids with its source.
      zones: src.zones.map((z) => ({ ...z, id: newZoneId() })),
    };
    setSettings(await ipc.updateSettings({ templates: [...settings.templates, tpl] }));
  };

  const renameTemplate = async (templateId: string, name: string) => {
    if (!settings) return;
    const templates = settings.templates.map((t) => (t.id === templateId ? { ...t, name } : t));
    setSettings(await ipc.updateSettings({ templates }));
  };

  const deleteTemplate = async (templateId: string) => {
    if (!settings || settings.templates.length <= 1) return; // last template: button is disabled
    const tpl = settings.templates.find((t) => t.id === templateId);
    if (!(await askConfirm({
      title: `Видалити шаблон «${tpl?.name ?? ''}»?`,
      description: 'Шаблон разом із усіма його зонами буде видалено.',
      destructive: true,
      confirmLabel: 'Видалити',
    }))) return;
    const templates = settings.templates.filter((t) => t.id !== templateId);
    // If the active template was the one deleted, fall back to the first left.
    const activeTemplateId = templates.some((t) => t.id === settings.activeTemplateId)
      ? settings.activeTemplateId
      : (templates[0] as ZoneTemplate).id;
    setSettings(await ipc.updateSettings({ templates, activeTemplateId }));
  };

  const setNumber = async (
    key: 'dwellSeconds' | 'crossfadeMs' | 'hrvWindowSec' | 'chartWindowSec',
    value: number,
  ) => {
    setSettings(await ipc.updateSettings({ [key]: value } as Partial<AppSettings>));
  };

  const toggleAuto = async (autoMode: boolean) => {
    setSettings(await ipc.updateSettings({ autoMode }));
  };

  const toggleKiosk = async (kioskMode: boolean) => {
    setSettings(await ipc.updateSettings({ kioskMode }));
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-[min(960px,90vw)] flex-col gap-0 overflow-hidden border-white/10 bg-neutral-950 p-0 text-white sm:rounded-xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-white/10 px-6 py-4">
          <DialogTitle>Налаштування</DialogTitle>
        </DialogHeader>

        {!settings ? (
          <div className="flex flex-1 items-center justify-center text-white/60">Завантаження…</div>
        ) : (
          <Tabs defaultValue="general" className="flex flex-1 flex-col overflow-hidden">
            <div className="mx-6 mt-4">
              <UpdateIndicator />
            </div>
            <TabsList className="mx-6 mt-4 w-fit bg-white/5">
              <TabsTrigger value="general">Загальне</TabsTrigger>
              <TabsTrigger value="zones">Зони</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <TabsContent value="general" className="mt-0 space-y-4">
                  <Card className="border-white/10 bg-white/[0.03]">
                    <CardContent className="space-y-4 p-5">
                      <p className='text-xs text-white/50'>Закрити віджети - Crtl + D</p>
                      <Separator className="bg-white/10" />
                      <Row>
                        <div className="space-y-0.5">
                          <Label htmlFor="auto-mode">Автоматичне перемикання відео</Label>
                          <p className="text-xs text-white/50">
                            Перемикає кліпи відповідно до поточної зони HR.
                          </p>
                        </div>
                        <Switch
                          id="auto-mode"
                          checked={settings.autoMode}
                          onCheckedChange={(v) => void toggleAuto(v)}
                        />
                      </Row>
                      <Separator className="bg-white/10" />
                      <Row>
                        <div className="space-y-0.5">
                          <Label htmlFor="kiosk-mode">Режим «кіоск»</Label>
                          <p className="text-xs text-white/50">
                            Повноекранний режим без меню. Вихід: <kbd>Ctrl+Shift+Q</kbd> або <kbd>Esc</kbd>×3 за 2 c.
                          </p>
                        </div>
                        <Switch
                          id="kiosk-mode"
                          checked={settings.kioskMode}
                          onCheckedChange={(v) => void toggleKiosk(v)}
                        />
                      </Row>
                      <Separator className="bg-white/10" />
                      <NumberRow
                        label="Затримка зони (с)"
                        value={settings.dwellSeconds}
                        min={3}
                        max={20}
                        onChange={(v) => void setNumber('dwellSeconds', v)}
                      />
                      <NumberRow
                        label="Тривалість cross-fade (мс)"
                        value={settings.crossfadeMs}
                        min={300}
                        max={6000}
                        step={100}
                        onChange={(v) => void setNumber('crossfadeMs', v)}
                      />
                      <NumberRow
                        label="Вікно HRV (с)"
                        value={settings.hrvWindowSec}
                        min={30}
                        max={300}
                        step={10}
                        onChange={(v) => void setNumber('hrvWindowSec', v)}
                      />
                      <NumberRow
                        label="Вікно графіку HR (с)"
                        value={settings.chartWindowSec}
                        min={30}
                        max={3600}
                        step={30}
                        onChange={(v) => void setNumber('chartWindowSec', v)}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="zones" className="mt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wider text-white/60">
                      Шаблони зон
                    </p>
                    <Button type="button" variant="success" size="sm" onClick={() => void addTemplate()}>
                      <Plus />
                      Новий шаблон
                    </Button>
                  </div>

                  <RadioGroup
                    value={settings.activeTemplateId}
                    onValueChange={(v) => void selectTemplate(v)}
                    className="gap-0"
                  >
                    <Accordion type="single" collapsible className="w-full">
                      {settings.templates.map((t) => (
                        <TemplateAccordionItem
                          key={t.id}
                          template={t}
                          active={t.id === settings.activeTemplateId}
                          canDelete={settings.templates.length > 1}
                          sensors={sensors}
                          onZoneDragEnd={onZoneDragEnd}
                          onRename={renameTemplate}
                          onDuplicate={duplicateTemplate}
                          onDeleteTemplate={deleteTemplate}
                          onUpdateZone={updateZone}
                          onPickVideo={pickVideo}
                          onDeleteZone={deleteZone}
                          onAddZone={addZone}
                          onResetVideos={resetVideos}
                          onResetZones={resetZones}
                        />
                      ))}
                    </Accordion>
                  </RadioGroup>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!confirmReq} onOpenChange={(o) => !o && answerConfirm(false)}>
      <AlertDialogContent className="border-white/10 bg-neutral-950 text-white">
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmReq?.title}</AlertDialogTitle>
          {confirmReq?.description && (
            <AlertDialogDescription className="text-white/60">
              {confirmReq.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={() => answerConfirm(false)}
          >
            Скасувати
          </AlertDialogCancel>
          <AlertDialogAction
            className={confirmReq?.destructive ? buttonVariants({ variant: 'destructive' }) : undefined}
            onClick={() => answerConfirm(true)}
          >
            {confirmReq?.confirmLabel ?? 'OK'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4">{children}</div>;
}

function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Row>
      <Label className="text-white/80">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 bg-white/5 text-white"
      />
    </Row>
  );
}

interface TemplateItemProps {
  template: ZoneTemplate;
  active: boolean;
  canDelete: boolean;
  sensors: ReturnType<typeof useSensors>;
  onZoneDragEnd: (templateId: string, e: DragEndEvent) => void | Promise<void>;
  onRename: (templateId: string, name: string) => void | Promise<void>;
  onDuplicate: (templateId: string) => void | Promise<void>;
  onDeleteTemplate: (templateId: string) => void | Promise<void>;
  onUpdateZone: (templateId: string, id: string, patch: Partial<ZoneConfig>) => void | Promise<void>;
  onPickVideo: (templateId: string, id: string) => void | Promise<void>;
  onDeleteZone: (templateId: string, id: string) => void | Promise<void>;
  onAddZone: (templateId: string) => void | Promise<void>;
  onResetVideos: (templateId: string) => void | Promise<void>;
  onResetZones: (templateId: string) => void | Promise<void>;
}

// One template = one accordion item. The radio (left of the trigger) sets the
// active template; the trigger expands the per-template zone editor. Radio and
// trigger are siblings, not nested — a button can't live inside a button.
function TemplateAccordionItem({
  template: t,
  active,
  canDelete,
  sensors,
  onZoneDragEnd,
  onRename,
  onDuplicate,
  onDeleteTemplate,
  onUpdateZone,
  onPickVideo,
  onDeleteZone,
  onAddZone,
  onResetVideos,
  onResetZones,
}: TemplateItemProps) {
  return (
    <AccordionItem
      value={t.id}
      className={cn(
        'rounded-lg border border-white/10 bg-white/[0.03] px-3 mb-2',
        active && 'border-emerald-500/40',
      )}
    >
      <div className="flex items-center gap-3">
        <RadioGroupItem
          value={t.id}
          id={`tpl-radio-${t.id}`}
          aria-label={`Зробити «${t.name}» активним`}
          className="border-white/40 text-emerald-400"
        />
        <AccordionTrigger className="flex-1 text-white hover:no-underline">
          <span className="flex items-center gap-2">
            <span className="font-semibold">{t.name || 'Без назви'}</span>
            {active && (
              <Badge className="border-emerald-500/30 bg-emerald-600/20 text-emerald-300">
                активний
              </Badge>
            )}
            <span className="text-xs font-normal text-white/40">{t.zones.length} зон</span>
          </span>
        </AccordionTrigger>
      </div>

      <AccordionContent className="space-y-3 pt-1">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label className="text-xs uppercase tracking-wider text-white/60">Назва шаблону</Label>
            <Input
              type="text"
              value={t.name}
              placeholder="Назва шаблону"
              onChange={(e) => void onRename(t.id, e.target.value)}
              className="bg-white/5 text-white"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void onDuplicate(t.id)}>
            <Copy />
            Дублювати
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            disabled={!canDelete}
            title={canDelete ? 'Видалити шаблон' : 'Має лишитися хоча б один шаблон'}
            onClick={() => void onDeleteTemplate(t.id)}
          >
            <Trash2 />
            Видалити шаблон
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void onZoneDragEnd(t.id, e)}
        >
          <SortableContext items={t.zones.map((z) => z.id)} strategy={verticalListSortingStrategy}>
            <div className="grid gap-3">
              {t.zones.map((z) => (
                <SortableZoneCard
                  key={z.id}
                  zone={z}
                  onUpdate={(id, patch) => onUpdateZone(t.id, id, patch)}
                  onPickVideo={(id) => onPickVideo(t.id, id)}
                  onDelete={(id) => onDeleteZone(t.id, id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="success" size="sm" onClick={() => void onAddZone(t.id)}>
            <Plus />
            Додати зону
          </Button>
          {isDefaultZoneShape(t.zones) ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onResetVideos(t.id)}
              title="Повернути відео дефолтних зон до стандартних URL"
            >
              <RotateCcw />
              Скинути відео
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void onResetZones(t.id)}
              title="Повернути зони до дефолтних (Низька / Середня / Висока)"
            >
              <RotateCcw />
              Скинути зони
            </Button>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

interface ZoneCardProps {
  zone: ZoneConfig;
  onUpdate: (id: string, patch: Partial<ZoneConfig>) => void | Promise<void>;
  onPickVideo: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

function SortableZoneCard({ zone: z, onUpdate, onPickVideo, onDelete }: ZoneCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: z.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: z.color,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-white/10 border-l-[3px] bg-white/[0.03] text-white',
        isDragging && 'z-10 opacity-50 shadow-2xl',
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            aria-label="Перетягнути зону"
            title="Перетягнути для зміни порядку"
            className="cursor-grab touch-none select-none rounded p-1 text-white/50 hover:text-white/80"
          >
            <GripVertical className="size-4" />
          </button>
          <input
            type="color"
            value={z.color}
            onChange={(e) => void onUpdate(z.id, { color: e.target.value })}
            className="size-8 cursor-pointer rounded-md border border-white/10 bg-transparent p-0"
            title="Колір зони"
          />
          <Input
            type="text"
            value={z.label}
            onChange={(e) => void onUpdate(z.id, { label: e.target.value })}
            placeholder="Назва зони"
            className="flex-1 bg-white/5 text-sm font-semibold text-white"
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => void onDelete(z.id)}
            title="Видалити зону"
          >
            <Trash2 />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="min HR">
            <Input
              type="number"
              value={z.minHr}
              onChange={(e) => void onUpdate(z.id, { minHr: Number(e.target.value) })}
              className="bg-white/5 text-white"
            />
          </Field>
          <Field label="max HR">
            <Input
              type="number"
              value={z.maxHr}
              onChange={(e) => void onUpdate(z.id, { maxHr: Number(e.target.value) })}
              className="bg-white/5 text-white"
            />
          </Field>
          <Field label="fade (мс)">
            <Input
              type="number"
              min={200}
              max={6000}
              step={100}
              value={z.fadeMs}
              onChange={(e) => void onUpdate(z.id, { fadeMs: Number(e.target.value) })}
              className="bg-white/5 text-white"
            />
          </Field>
          <Field label="відео (файл або URL)">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={z.videoPath}
                placeholder="C:\... або https://..."
                onChange={(e) => void onUpdate(z.id, { videoPath: e.target.value })}
                className="flex-1 bg-white/5 text-white"
              />
              <Button size="sm" variant="success" onClick={() => void onPickVideo(z.id)}>
                Обрати файл…
              </Button>
              {z.videoPath && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white/60 hover:text-white"
                  onClick={() => void onUpdate(z.id, { videoPath: '' })}
                  title="Очистити"
                >
                  <X />
                </Button>
              )}
            </div>
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs uppercase tracking-wider text-white/60">{label}</Label>
      {children}
    </div>
  );
}
