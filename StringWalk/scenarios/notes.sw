# a column you step over rather than read. every password record has a notes
# blob, and one of them is 700 characters of a BitLocker recovery key, so the
# table is unreadable before you have read anything.
add record username-of
add notes
# `shorten` draws it as a hash instead. display only — the value still joins,
# still steps, and still counts, which the next column proves: `ip` walks out
# of the whole notes text, not out of the stub.
shorten
add ip
