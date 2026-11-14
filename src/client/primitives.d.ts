/**
 * The parts of the Harness shared component module this plugin uses. The Web
 * shell provides the module to plugin bundles at runtime; it ships no type
 * declarations, so the props here follow its source in the installed Harness.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type {
    ButtonHTMLAttributes,
    ComponentType,
    ForwardRefExoticComponent,
    InputHTMLAttributes,
    ReactElement,
    ReactNode,
    RefAttributes,
  } from 'react'

  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
  }
  export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>>

  export function Switch(props: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
    title?: string
    className?: string
  }): ReactElement

  export function Checkbox(props: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
    title?: string
    className?: string
  }): ReactElement

  export const Input: ForwardRefExoticComponent<
    InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; className?: string } & RefAttributes<HTMLInputElement>
  >

  export type TagTone =
    | 'outline'
    | 'solid'
    | 'neutral'
    | 'quiet'
    | 'success'
    | 'info'
    | 'warning'
    | 'danger'

  export function Tag(props: { tone?: TagTone; className?: string; children?: ReactNode }): ReactElement

  export function PathLabel(props: { path: string; className?: string } & Record<string, unknown>): ReactElement

  export function Pill(
    props: {
      active?: boolean
      className?: string
      children?: ReactNode
      onClick?: () => void
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>,
  ): ReactElement

  export function SegmentedControl<V extends string>(props: {
    id: string
    value: V
    options: readonly { value: V; label: string; disabled?: boolean; title?: string }[]
    onChange: (value: V) => void
    label: string
    disabled?: boolean
    className?: string
  }): ReactElement

  export interface SegmentedTabItem<V extends string> {
    id?: string
    value: V
    label: ReactNode
    panelId?: string
  }

  export function SegmentedTabs<V extends string>(props: {
    items: readonly SegmentedTabItem<V>[]
    value: V
    onChange: (value: V) => void
    label: string
    className?: string
    size?: 'sm' | 'md'
  }): ReactElement

  export function Modal(props: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel?: string
    description?: ReactNode
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
    headless?: boolean
    backdropBlur?: boolean
  }): ReactElement | null

  export function Toast(props: {
    text: string
    icon?: ReactNode
    tone?: 'success'
    holdMs?: number
    onDone: () => void
    actions?: ReactNode
  }): ReactElement

  export function StateDot(props: {
    state: 'done' | 'warning' | 'ongoing' | 'error' | 'idle'
    size?: number
    className?: string
    appearance?: 'dot' | 'step'
  }): ReactElement

  export function TextShimmer(props: { children?: ReactNode; active?: boolean; className?: string }): ReactElement

  export function Tooltip(props: {
    label: string
    shortcutKeys?: readonly string[]
    side?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'start' | 'center' | 'end'
    delayMs?: number
    focusDelayMs?: number
    gap?: number
    disabled?: boolean
    portal?: boolean
    maxWidth?: number
    openOnClick?: boolean
    onlyWhenClipped?: boolean
    children: ReactElement
  }): ReactElement

  type Icon = ComponentType<{ size?: number; className?: string }>
  export const IconApiOutlineRegular: Icon
  export const IconChevronDownOutlineRegular: Icon
  export const IconChevronRightOutlineRegular: Icon
  export const IconCloseOutlineRegular: Icon
  export const IconClockOutlineRegular: Icon
  export const IconCloseOutlineRegular: Icon
  export const IconCodeOutlineRegular: Icon
  export const IconEditOutlineRegular: Icon
  export const IconEllipsisOutlineRegular: Icon
  export const IconPlusOutlineRegular: Icon
  export const IconRefreshOutlineRegular: Icon
  export const IconSearchOutlineRegular: Icon
  export const IconSlidersTwoOutlineRegular: Icon
  export const IconTrashOutlineRegular: Icon
  export const IconWarningOutlineRegular: Icon
}
