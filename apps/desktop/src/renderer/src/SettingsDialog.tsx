import { MIN_PITCH_MM } from '@leathercad/domain';
import type { Iron, Preferences } from '@leathercad/platform';
import { Ellipsis, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import {
  LANGUAGES,
  SYSTEM_LANGUAGE,
  catalogueFor,
  languageName,
  resolveLocale,
  type MessageKey,
} from '../../shared/i18n.js';
import { intoMenu } from './fieldMenu.js';
import { useI18n } from './i18n.js';
import { Icon } from './icons/Icon.js';
import { defaultIron, withoutIron } from './irons.js';
import { MenuButton } from './Menu.js';
import { focusAfter } from './menus.js';
import { NumberField } from './NumberField.js';
import {
  IS_MAC,
  KeyCap,
  useKeyLabel,
  useKeymap,
  useKeysInSentences,
  useLayout,
  useShownKeys,
} from './keyCaps.js';
import { KEYMAP, type CommandId, type KeyBindings } from './keymap.js';
import {
  apply,
  bindingFor,
  differs,
  isChangeable,
  proposeKey,
  proposeReset,
  swap,
  type Proposal,
} from './rebind.js';
import { shortcutGroups } from './shortcuts.js';

export type SettingsSection = 'general' | 'appearance' | 'tools' | 'language' | 'shortcuts';

/** Where a translator starts (README § Translations). */
const TRANSLATE_URL = 'https://github.com/crnlsp/leathercad#translations';

interface Props {
  section: SettingsSection;
  onSection: (next: SettingsSection) => void;
  preferences: Preferences;
  onPreferences: (changes: Partial<Preferences>) => void;
  /** The operating system's languages, most preferred first: what *Follow system* follows. */
  systemLanguages: readonly string[];
  /** How many projects the Project menu lists. */
  recentCount: number;
  onClearRecent: () => void;
  onClose: () => void;
  /** Ids for the irons a maker adds (U.13). */
  nextId: () => string;
}

/**
 * The sections, in the sidebar's order (8.7). **A section is written only
 * when LeatherCAD has a real setting for it** — no placeholder, no "coming
 * soon". A new one is one entry here.
 */
const SECTIONS: readonly {
  id: SettingsSection;
  title: MessageKey;
  pane: (props: Props) => ReactNode;
}[] = [
  { id: 'general', title: 'settings.section.general', pane: (props) => <General {...props} /> },
  {
    id: 'appearance',
    title: 'settings.section.appearance',
    pane: (props) => <Appearance {...props} />,
  },
  { id: 'tools', title: 'settings.section.tools', pane: (props) => <MyTools {...props} /> },
  { id: 'language', title: 'settings.section.language', pane: (props) => <Language {...props} /> },
  {
    id: 'shortcuts',
    title: 'settings.section.shortcuts',
    pane: (props) => <Shortcuts {...props} />,
  },
];

/**
 * Settings (8.7): the application's own, as a sidebar of sections — a
 * surface that grows a section when a setting needs one.
 *
 * Every change applies at once, through the same preference its in-place
 * control changes: there is no Save and no Cancel. A fixed height, so moving
 * between sections never resizes it. Keys stop here, as in the other dialogs,
 * so a letter typed in it cannot switch tools behind it.
 */
export function SettingsDialog(props: Props) {
  const { section, onSection, onClose } = props;
  const { t } = useI18n();
  const current = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]!;

  // Focus goes to the section it opened on, once: afterwards it is the maker's.
  const openedOn = useRef(section);
  useEffect(() => {
    document.getElementById(`settings-tab-${openedOn.current}`)?.focus();
  }, []);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        data-testid="settings-dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
      >
        {/* A div, not a header: a header here would be a second banner. */}
        <div className="settings-header">
          <h3 id="settings-dialog-title">{t('settings.title')}</h3>
          <button
            type="button"
            className="tool quiet icon-only"
            aria-label={t('settings.close')}
            data-testid="settings-close"
            onClick={onClose}
          >
            <Icon of={X} />
          </button>
        </div>
        <div className="settings-body">
          <div
            className="settings-sections"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t('settings.sections')}
            onKeyDown={(event) => {
              const at = SECTIONS.findIndex((entry) => entry.id === section);
              const next = SECTIONS[focusAfter(event.key, at, SECTIONS.length)];
              if (next === undefined) return;
              event.preventDefault();
              onSection(next.id);
              document.getElementById(`settings-tab-${next.id}`)?.focus();
            }}
          >
            {SECTIONS.map((entry) => (
              <button
                key={entry.id}
                id={`settings-tab-${entry.id}`}
                type="button"
                role="tab"
                aria-selected={entry.id === section}
                aria-controls="settings-pane"
                tabIndex={entry.id === section ? 0 : -1}
                className={entry.id === section ? 'settings-tab active' : 'settings-tab'}
                data-testid={`settings-tab-${entry.id}`}
                onClick={() => onSection(entry.id)}
              >
                {t(entry.title)}
              </button>
            ))}
          </div>
          <div
            id="settings-pane"
            className="settings-pane"
            role="tabpanel"
            aria-labelledby={`settings-tab-${current.id}`}
            tabIndex={0}
            data-testid={`settings-pane-${current.id}`}
          >
            <h4>{t(current.title)}</h4>
            {current.pane(props)}
          </div>
        </div>
      </div>
    </div>
  );
}

function General({ recentCount, onClearRecent }: Props) {
  const { t } = useI18n();
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-name">{t('settings.recent.name')}</span>
        <span className="setting-note">
          {t('settings.recent.note')}{' '}
          {recentCount === 0
            ? t('settings.recent.none')
            : t('settings.recent.count', { count: recentCount })}
        </span>
      </div>
      <button
        type="button"
        className="tool"
        data-testid="clear-recent"
        disabled={recentCount === 0}
        onClick={onClearRecent}
      >
        {t('settings.recent.clear')}
      </button>
    </div>
  );
}

function Appearance({ preferences, onPreferences }: Props) {
  const { t } = useI18n();
  return (
    <>
      <Toggle
        id="legend-open"
        name={t('settings.legend.name')}
        note={t('settings.legend.note')}
        checked={preferences.legendOpen}
        onChange={(on) => onPreferences({ legendOpen: on })}
      />
      <Toggle
        id="tool-names"
        name={t('settings.toolNames.name')}
        note={t('settings.toolNames.note')}
        checked={!preferences.toolRailCollapsed}
        onChange={(on) => onPreferences({ toolRailCollapsed: !on })}
      />
    </>
  );
}

/**
 * The maker's irons and starting values (U.13, R-15). The irons are what a
 * hole set's Iron menu lists, one of them the default a new hole set takes;
 * the margin and the thickness are what the app makes new stitch lines,
 * allowances and folds with. Each new thing carries its own copy, so a project
 * reads the same on a machine with other tools.
 */
function MyTools({ preferences, onPreferences, nextId }: Props) {
  const { t } = useI18n();
  const names = useRef(new Map<string, HTMLInputElement>());
  const { irons } = preferences;
  const editName = (id: string): boolean => {
    const input = names.current.get(id);
    input?.focus();
    input?.select();
    return input !== undefined;
  };
  // A new iron's name takes the caret once its row is drawn.
  const added = useRef<string | null>(null);
  useEffect(() => {
    if (added.current !== null && editName(added.current)) added.current = null;
  }, [irons]);

  const change = (id: string, patch: Partial<Iron>): void =>
    onPreferences({ irons: irons.map((iron) => (iron.id === id ? { ...iron, ...patch } : iron)) });
  const add = (): void => {
    const id = nextId();
    const pitchMm = defaultIron(preferences)?.pitchMm ?? DEFAULT_PITCH_MM;
    const name = t('settings.tools.newIron', { number: String(irons.length + 1) });
    onPreferences({
      irons: [...irons, { id, name, pitchMm }],
      defaultIronId: preferences.defaultIronId ?? id,
    });
    added.current = id;
  };

  return (
    <>
      <p className="setting-note">{t('settings.tools.intro')}</p>
      <h5 className="settings-subhead">{t('settings.tools.irons')}</h5>
      {irons.length === 0 ? (
        <p className="setting-note" data-testid="no-irons">
          {t('settings.tools.noIrons')}
        </p>
      ) : (
        <table className="irons" data-testid="irons">
          <thead>
            <tr>
              <th scope="col">{t('settings.tools.default')}</th>
              <th scope="col">{t('settings.tools.name')}</th>
              <th scope="col">{t('settings.tools.pitch')}</th>
              <th scope="col">
                <span className="visually-hidden">{t('settings.tools.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {irons.map((iron) => (
              <tr key={iron.id} data-testid={`iron-${iron.id}`}>
                <td>
                  <input
                    type="radio"
                    name="default-iron"
                    data-testid={`iron-default-${iron.id}`}
                    aria-label={t('settings.tools.makeDefault', { name: iron.name })}
                    checked={iron.id === preferences.defaultIronId}
                    onChange={() => onPreferences({ defaultIronId: iron.id })}
                  />
                </td>
                <td>
                  <IronName
                    iron={iron}
                    inputRef={(input) => {
                      if (input === null) names.current.delete(iron.id);
                      else names.current.set(iron.id, input);
                    }}
                    onName={(name) => change(iron.id, { name })}
                  />
                </td>
                <td className="iron-pitch">
                  <NumberField
                    label={t('settings.tools.pitchOf', { name: iron.name })}
                    hideLabel
                    value={iron.pitchMm}
                    // The domain's floor, as the hole set's own Pitch field.
                    min={MIN_PITCH_MM}
                    step={0.05}
                    onCommit={(pitchMm) => change(iron.id, { pitchMm })}
                  />
                </td>
                <td>
                  <MenuButton
                    label={t('settings.tools.ironActions', { name: iron.name })}
                    testId={`iron-menu-${iron.id}`}
                    className="icon-toggle"
                    align="end"
                    entries={[
                      {
                        kind: 'item',
                        id: `rename-iron-${iron.id}`,
                        label: t('settings.tools.rename'),
                        icon: Pencil,
                        // After the menu has closed and settled focus.
                        onChoose: () => requestAnimationFrame(() => editName(iron.id)),
                      },
                      {
                        kind: 'item',
                        id: `delete-iron-${iron.id}`,
                        label: t('settings.tools.delete'),
                        icon: Trash2,
                        danger: true,
                        note: t('settings.tools.deleteNote'),
                        onChoose: () => onPreferences(withoutIron(preferences, iron.id)),
                      },
                    ]}
                  >
                    <Icon of={Ellipsis} />
                  </MenuButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="tool add-iron" data-testid="add-iron" onClick={add}>
        <Icon of={Plus} />
        {t('settings.tools.addIron')}
      </button>

      <h5 className="settings-subhead">{t('settings.tools.forNewPieces')}</h5>
      <div className="setting">
        <div className="setting-text">
          <span className="setting-name">{t('settings.tools.margin.name')}</span>
          <span className="setting-note">{t('settings.tools.margin.note')}</span>
        </div>
        <span className="setting-number" data-testid="setting-margin">
          <NumberField
            label={t('settings.tools.margin.name')}
            hideLabel
            value={preferences.stitchMarginMm}
            min={0.5}
            step={0.5}
            onCommit={(stitchMarginMm) => onPreferences({ stitchMarginMm })}
          />
        </span>
      </div>
      <div className="setting">
        <div className="setting-text">
          <span className="setting-name">{t('settings.tools.thickness.name')}</span>
          <span className="setting-note">{t('settings.tools.thickness.note')}</span>
        </div>
        <span className="setting-number" data-testid="setting-thickness">
          <NumberField
            label={t('settings.tools.thickness.name')}
            hideLabel
            value={preferences.leatherThicknessMm}
            placeholder={t('editor.notSet')}
            // Leather has thickness: "none" is said by clearing, never by 0.
            min={0.1}
            step={0.1}
            onCommit={(leatherThicknessMm) => onPreferences({ leatherThicknessMm })}
            onClear={() => onPreferences({ leatherThicknessMm: null })}
          />
        </span>
      </div>
    </>
  );
}

/** What a new iron's pitch starts at when the maker has no default to copy. */
const DEFAULT_PITCH_MM = 3.85;

/**
 * An iron's name, kept as typed until Enter or leaving the field; Escape, or
 * a name left blank, puts it back. Whitespace is the maker's typo, not a name.
 */
function IronName({
  iron,
  inputRef,
  onName,
}: {
  iron: Iron;
  inputRef: (input: HTMLInputElement | null) => void;
  onName: (name: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft === null) return;
    const name = draft.trim();
    setDraft(null);
    if (name !== '' && name !== iron.name) onName(name);
  };
  return (
    <label className="field">
      <span className="visually-hidden">{t('settings.tools.name')}</span>
      <input
        ref={inputRef}
        type="text"
        data-testid={`iron-name-${iron.id}`}
        value={draft ?? iron.name}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          // The field's own menu is not leaving it (U.20).
          if (!intoMenu(event.relatedTarget)) commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            // Escape leaves the name, not the dialog.
            event.stopPropagation();
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/**
 * The interface's language (ADR 0018): the system's, or one chosen. Applies
 * at once, as every setting does. Lists the languages LeatherCAD supports —
 * `SUPPORTED_LANGUAGES`, not whatever files exist — each by its own name, so
 * the maker can find theirs whatever the window is in, and by this language's
 * name for it. A development build adds any translation not supported yet,
 * marked as a preview.
 */
function Language({ preferences, onPreferences, systemLanguages }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const noteId = useId();
  const named = (tag: string): string => languageName(catalogueFor(tag) ?? tag, i18n.locale);

  const followed = resolveLocale(SYSTEM_LANGUAGE, systemLanguages);
  // The system's own first language, when it is not the one followed: said,
  // so English on a French system is not a mystery.
  const wanted = systemLanguages[0];
  const unavailable =
    preferences.language === SYSTEM_LANGUAGE &&
    wanted !== undefined &&
    catalogueFor(followed) !== catalogueFor(wanted);
  const [before, after] = t('settings.language.invite').split('{{link}}');

  return (
    <div className="setting">
      <div className="setting-text">
        <label className="setting-name" htmlFor="setting-language">
          {t('settings.language.name')}
        </label>
        <span className="setting-note" id={noteId}>
          {t('settings.language.note')}
        </span>
        {unavailable && (
          <span className="setting-note" data-testid="language-unavailable">
            {t('settings.language.unavailable', {
              language: languageName(wanted.split(/[-_.]/)[0]!, i18n.locale),
              fallback: named(followed),
            })}
          </span>
        )}
        <span className="setting-note">
          {before}
          {/* An https link: the window-open handler sends it to the browser. */}
          <a href={TRANSLATE_URL} target="_blank" rel="noreferrer">
            {t('settings.language.inviteLink')}
          </a>
          {after}
        </span>
      </div>
      <select
        id="setting-language"
        data-testid="setting-language"
        aria-describedby={noteId}
        value={preferences.language}
        onChange={(event) => onPreferences({ language: event.target.value })}
      >
        <option value={SYSTEM_LANGUAGE}>
          {t('settings.language.system', { language: named(followed) })}
        </option>
        {LANGUAGES.map(({ tag, name, preview }) => {
          const label =
            tag === catalogueFor(i18n.locale)
              ? name
              : t('settings.language.option', { own: name, here: named(tag) });
          return (
            <option key={tag} value={tag} lang={tag}>
              {preview === true ? t('settings.language.preview', { language: label }) : label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

/** One on-or-off setting: its name, what it changes, and the box. */
function Toggle({
  id,
  name,
  note,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  note: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const noteId = useId();
  return (
    <div className="setting">
      <div className="setting-text">
        <label className="setting-name" htmlFor={`setting-${id}`}>
          {name}
        </label>
        <span className="setting-note" id={noteId}>
          {note}
        </span>
      </div>
      <input
        id={`setting-${id}`}
        type="checkbox"
        data-testid={`setting-${id}`}
        aria-describedby={noteId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

/**
 * Every key the app answers to (8.2), from the keymap (U.3), and the place to
 * change one (U.12). *Change* listens for the next keys pressed; a key another
 * command in the same place has is named, to swap or leave; *Reset* puts one
 * command's keys back, *Reset all* every one. Each change applies at once,
 * everywhere a key is shown or heard, as every setting does.
 */
function Shortcuts({ preferences, onPreferences }: Props) {
  const { t } = useI18n();
  const keymap = useKeymap();
  const layout = useLayout();
  const shown = useShownKeys();
  const label = useKeyLabel();
  const sentences = useKeysInSentences();
  const bindings: KeyBindings = preferences.keyBindings;
  /** The command listening for its new keys, and what was last said about a press. */
  const [listening, setListening] = useState<{
    readonly id: CommandId;
    readonly note: string | null;
  } | null>(null);
  /** A change waiting on Swap or Cancel. */
  const [clash, setClash] = useState<{
    readonly proposal: Proposal;
    readonly owner: CommandId;
    readonly canSwap: boolean;
  } | null>(null);
  /** What the last change came to, said politely. */
  const [said, setSaid] = useState('');
  const swapRef = useRef<HTMLButtonElement>(null);
  useEffect(() => swapRef.current?.focus(), [clash]);

  const does = (id: CommandId): string => {
    const command = keymap.find((entry) => entry.id === id);
    return command === undefined ? id : t(command.does);
  };
  // The keys asked for: a reset's are the defaults, not the ones it has now.
  const keysOf = (proposal: Proposal): string => {
    const key = proposal.keys?.[0] ?? KEYMAP.find((command) => command.id === proposal.id)?.keys[0];
    return key === undefined ? '' : label(key);
  };
  const changeButton = (id: CommandId): void =>
    document.getElementById(`shortcut-change-${id}`)?.focus();

  const done = (next: KeyBindings, id: CommandId): void => {
    onPreferences({ keyBindings: next });
    setListening(null);
    setClash(null);
    // After the keymap has changed, so the label is the new key's.
    requestAnimationFrame(() => changeButton(id));
  };
  const propose = (proposal: Proposal): void => {
    const change = apply(bindings, proposal, IS_MAC);
    if (change === 'unusable' || change === 'needsModifier') {
      setListening({
        id: proposal.id,
        note:
          change === 'unusable'
            ? t('settings.shortcuts.unusable')
            : t('settings.shortcuts.needsModifier', { command: does(proposal.id) }),
      });
      return;
    }
    if ('clash' in change) {
      setListening(null);
      setClash({ proposal, owner: change.clash, canSwap: change.canSwap });
      return;
    }
    setSaid(
      t(proposal.keys === null ? 'settings.shortcuts.wasReset' : 'settings.shortcuts.changed', {
        command: does(proposal.id),
      }),
    );
    done(change.bindings, proposal.id);
  };

  const onCapture = (id: CommandId) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    // Tab goes on, and leaving the button ends the listening: no trap.
    if (event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const press = event.nativeEvent;
    if (press.code === 'Escape') {
      setListening(null);
      return;
    }
    const taken = bindingFor(press, IS_MAC);
    if (taken === null) return;
    if (taken === 'reserved') {
      setListening({
        id,
        note: t('settings.shortcuts.reserved', { key: label({ code: press.code }) }),
      });
    } else if (typeof taken === 'string') {
      // Each refusal says why, so the maker knows what to press instead.
      const note =
        taken === 'typesOther'
          ? t('settings.shortcuts.typesOther', { typed: press.key })
          : taken === 'typesSize'
            ? t('settings.shortcuts.typesSize')
            : t('settings.shortcuts.unusable');
      setListening({ id, note });
    } else propose(proposeKey(id, taken, press));
  };

  const changed = Object.keys(bindings).length > 0;
  return (
    <>
      <div className="shortcuts-intro">
        <p className="setting-note">{t('settings.shortcuts.intro', sentences)}</p>
        <button
          type="button"
          className="tool"
          data-testid="shortcuts-reset-all"
          disabled={!changed}
          onClick={() => {
            onPreferences({ keyBindings: {} });
            setClash(null);
            setListening(null);
            setSaid(t('settings.shortcuts.allReset'));
          }}
        >
          {t('settings.shortcuts.resetAll')}
        </button>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {said}
      </p>
      <div className="shortcuts-groups">
        {shortcutGroups(keymap).map((group) => (
          <section key={group.id} aria-label={t(`shortcuts.group.${group.id}`)}>
            <h5>{t(`shortcuts.group.${group.id}`)}</h5>
            <div className="shortcut-list">
              {group.shortcuts.map((shortcut) => {
                const { id } = shortcut;
                // Fixed by the keymap, or by the platform: macOS's ⌘Q is its own.
                const fixed = id !== undefined && !isChangeable(id, IS_MAC);
                const here = id !== undefined && listening?.id === id;
                const clashing = id !== undefined && clash?.proposal.id === id ? clash : null;
                return (
                  <div
                    className="shortcut-row"
                    key={`${group.id}-${shortcut.does}`}
                    data-testid={id === undefined ? undefined : `shortcut-${id}`}
                  >
                    <span className="shortcut-does">{t(shortcut.does)}</span>
                    <span className="shortcut-keys" data-testid={id && `shortcut-keys-${id}`}>
                      {here ? (
                        <span className="shortcut-listening">
                          {t('settings.shortcuts.listening', sentences)}
                        </span>
                      ) : (
                        shown(shortcut).map((binding, index) => (
                          <span key={JSON.stringify(binding)}>
                            {index > 0 && (
                              <span className="shortcut-or"> {t('shortcuts.or')} </span>
                            )}
                            <KeyCap command={binding} />
                          </span>
                        ))
                      )}
                    </span>
                    <span className="shortcut-actions">
                      {fixed && (
                        <span className="shortcut-fixed">{t('settings.shortcuts.fixed')}</span>
                      )}
                      {id !== undefined && !fixed && (
                        <>
                          <button
                            type="button"
                            id={`shortcut-change-${id}`}
                            className={here ? 'tool listening' : 'tool quiet'}
                            data-testid={`change-${id}`}
                            aria-label={t('settings.shortcuts.changeLabel', {
                              command: t(shortcut.does),
                            })}
                            aria-pressed={here}
                            onClick={(event) => {
                              setClash(null);
                              event.currentTarget.focus();
                              setListening(here ? null : { id, note: null });
                            }}
                            onKeyDownCapture={here ? onCapture(id) : undefined}
                            onBlur={() => {
                              if (here) setListening(null);
                            }}
                          >
                            {t('settings.shortcuts.change')}
                          </button>
                          {differs(bindings, id) && (
                            <button
                              type="button"
                              className="tool quiet"
                              data-testid={`reset-${id}`}
                              aria-label={t('settings.shortcuts.resetLabel', {
                                command: t(shortcut.does),
                              })}
                              onClick={() => propose(proposeReset(id, layout, IS_MAC))}
                            >
                              {t('settings.shortcuts.reset')}
                            </button>
                          )}
                        </>
                      )}
                    </span>
                    {here && listening.note !== null && (
                      <p className="shortcut-note" role="status" data-testid="shortcut-note">
                        {listening.note}
                      </p>
                    )}
                    {clashing !== null && (
                      <div
                        className="shortcut-clash"
                        role="alert"
                        data-testid="shortcut-clash"
                        onKeyDown={(event) => {
                          // Esc leaves the key where it was, not the dialog.
                          if (event.key !== 'Escape') return;
                          event.stopPropagation();
                          setClash(null);
                          changeButton(clashing.proposal.id);
                        }}
                      >
                        <ClashWords
                          words={t(
                            clashing.canSwap
                              ? 'settings.shortcuts.clash'
                              : 'settings.shortcuts.clashFixed',
                            { command: does(clashing.owner) },
                          )}
                          keys={keysOf(clashing.proposal)}
                        />
                        {clashing.canSwap && (
                          <button
                            ref={swapRef}
                            type="button"
                            className="tool"
                            data-testid="clash-swap"
                            onClick={() => {
                              setSaid(
                                t('settings.shortcuts.swapped', {
                                  command: does(clashing.proposal.id),
                                  other: does(clashing.owner),
                                }),
                              );
                              done(swap(bindings, clashing.proposal, IS_MAC), clashing.proposal.id);
                            }}
                          >
                            {t('settings.shortcuts.swap')}
                          </button>
                        )}
                        <button
                          ref={clashing.canSwap ? undefined : swapRef}
                          type="button"
                          className="tool quiet"
                          data-testid="clash-cancel"
                          onClick={() => {
                            setClash(null);
                            changeButton(clashing.proposal.id);
                          }}
                        >
                          {t('settings.shortcuts.cancel')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** A clash's sentence with its keys as a cap where `{{keys}}` stands. */
function ClashWords({ words, keys }: { words: string; keys: string }) {
  const [before, after] = words.split('{{keys}}');
  return (
    <span>
      {before}
      <kbd>{keys}</kbd>
      {after}
    </span>
  );
}
