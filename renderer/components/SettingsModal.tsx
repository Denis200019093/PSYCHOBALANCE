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
import { GripVertical, Plus, Trash2, X } from 'lucide-react';
import { ipc } from '@/lib/ipc/client';
import type { AppSettings, ZoneConfig } from '@shared/contracts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
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

  const updateZone = async (id: string, patch: Partial<ZoneConfig>) => {
    if (!settings) return;
    const zones = settings.zones.map((z) => (z.id === id ? { ...z, ...patch } : z));
    setSettings(await ipc.updateSettings({ zones }));
  };

  const pickVideo = async (id: string) => {
    const path = await ipc.pickVideo();
    if (path) await updateZone(id, { videoPath: path });
  };

  const deleteZone = async (id: string) => {
    if (!settings) return;
    const z = settings.zones.find((x) => x.id === id);
    if (!z) return;
    if (!confirm(`Видалити зону "${z.label}"?`)) return;
    const zones = settings.zones.filter((x) => x.id !== id);
    setSettings(await ipc.updateSettings({ zones }));
  };

  const addZone = async () => {
    if (!settings) return;
    const lastMax = settings.zones.reduce((m, z) => Math.max(m, z.maxHr), 0);
    const minHr = Number.isFinite(lastMax) ? lastMax : 0;
    const newZone: ZoneConfig = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: 'Нова зона',
      color: '#7a7a7a',
      minHr,
      maxHr: minHr + 10,
      videoPath: '',
      fadeMs: 1500,
    };
    setSettings(await ipc.updateSettings({ zones: [...settings.zones, newZone] }));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!settings) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = settings.zones.findIndex((z) => z.id === active.id);
    const newIdx = settings.zones.findIndex((z) => z.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(settings.zones, oldIdx, newIdx);
    setSettings({ ...settings, zones: next });
    await ipc.updateSettings({ zones: next });
  };

  const setNumber = async (
    key: 'dwellSeconds' | 'smoothingWindowSec' | 'crossfadeMs' | 'hrvWindowSec' | 'chartWindowSec',
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-[min(960px,90vw)] flex-col gap-0 overflow-hidden border-white/10 bg-neutral-950 p-0 text-white sm:rounded-xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-white/10 px-6 py-4">
          <DialogTitle>Налаштування</DialogTitle>
        </DialogHeader>

        {!settings ? (
          <div className="flex flex-1 items-center justify-center text-white/60">Завантаження…</div>
        ) : (
          <Tabs defaultValue="general" className="flex flex-1 flex-col overflow-hidden">
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
                        label="Вікно згладжування HR (с)"
                        value={settings.smoothingWindowSec}
                        min={1}
                        max={30}
                        onChange={(v) => void setNumber('smoothingWindowSec', v)}
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

                <TabsContent value="zones" className="mt-0">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={settings.zones.map((z) => z.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-3">
                        {settings.zones.map((z) => (
                          <SortableZoneCard
                            key={z.id}
                            zone={z}
                            onUpdate={updateZone}
                            onPickVideo={pickVideo}
                            onDelete={deleteZone}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <Button
                    type="button"
                    variant="success"
                    className="mt-4"
                    onClick={() => void addZone()}
                  >
                    <Plus />
                    Додати зону
                  </Button>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
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
          <Field label="відео">
            <div className="flex items-center gap-2">
              <code
                className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-white/5 px-2 py-1.5 text-xs"
                title={z.videoPath}
              >
                {z.videoPath || '— не вибрано —'}
              </code>
              <Button size="sm" variant="success" onClick={() => void onPickVideo(z.id)}>
                Обрати…
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
