import React from 'react'

const h = React.createElement
const Icon = () => h('span', null)

export function Button({ variant, size, icon, children, type = 'button', ...rest }) {
  return h('button', { type, 'data-variant': variant, 'data-size': size, ...rest }, icon, children)
}

export function Switch({ checked, onChange, label, disabled, title, className }) {
  return h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked,
    'aria-label': label,
    disabled,
    title,
    className,
    onClick: () => onChange(!checked),
  })
}

export function Checkbox({ checked, onChange, label, disabled, title, className }) {
  return h(
    'label',
    { className, title },
    h('input', { type: 'checkbox', checked, disabled, onChange: (event) => onChange(event.target.checked) }),
    h('span', null, label),
  )
}

export const Input = React.forwardRef(function Input({ icon, className, ...rest }, ref) {
  return h('span', { className }, icon, h('input', { ref, ...rest }))
})

export function Tag({ tone, className, children }) {
  return h('span', { 'data-tone': tone, className }, children)
}

export function Menu({ open, anchor, items = [], onSelect }) {
  return h(
    'span',
    { className: 'menu-stub' },
    anchor,
    open
      ? h(
          'div',
          { role: 'menu' },
          items
            .filter((item) => item.type === undefined)
            .map((item) =>
              h(
                'button',
                { key: item.id, type: 'button', role: 'menuitem', onClick: () => onSelect?.(item.id) },
                item.label,
              ),
            ),
        )
      : null,
  )
}

export function Pill({ active, className, children, onClick, ...rest }) {
  return h('button', { type: 'button', 'aria-pressed': active, className, onClick, ...rest }, children)
}

export function SegmentedTabs({ items, value, onChange, label }) {
  return h(
    'div',
    { role: 'tablist', 'aria-label': label },
    items.map((item) =>
      h(
        'button',
        {
          key: item.value,
          type: 'button',
          role: 'tab',
          'aria-selected': item.value === value,
          onClick: () => onChange(item.value),
        },
        item.label,
      ),
    ),
  )
}

export function SegmentedControl({ id, value, options, onChange, label }) {
  return h(
    'div',
    { role: 'tablist', 'aria-label': label },
    options.map((option) =>
      h(
        'button',
        {
          key: option.value,
          id: id + '-' + option.value,
          type: 'button',
          role: 'tab',
          'aria-selected': option.value === value,
          onClick: () => onChange(option.value),
        },
        option.label,
      ),
    ),
  )
}

export function Modal({ open, title, children, footer }) {
  return open ? h('div', { role: 'dialog', 'aria-label': title }, children, footer) : null
}

export function Toast({ text }) {
  return h('div', { role: 'status' }, text)
}

export function StateDot({ state }) {
  return h('span', { 'data-state': state })
}

export function TextShimmer({ children }) {
  return h('span', null, children)
}

export function Tooltip({ children }) {
  return children
}

export function PathLabel({ path, className }) {
  return h('span', { className, title: path }, path)
}

export const IconApiOutlineRegular = Icon
export const IconChevronDownOutlineRegular = Icon
export const IconChevronRightOutlineRegular = Icon
export const IconCloseOutlineRegular = Icon
export const IconCodeOutlineRegular = Icon
export const IconEditOutlineRegular = Icon
export const IconEllipsisOutlineRegular = Icon
export const IconPlusOutlineRegular = Icon
export const IconSearchOutlineRegular = Icon
export const IconRefreshOutlineRegular = Icon
export const IconTrashOutlineRegular = Icon
export const IconWarningOutlineRegular = Icon
