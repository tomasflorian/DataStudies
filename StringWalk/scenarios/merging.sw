# a kind with more than one way in does not guess. without a * it says what it
# would merge, and adds nothing.
add kind
# with a * it takes all of them. `is-a kind` and `example kind` are the two
# ends of one relation, so this column holds what each kind is an example of
# AND what is an example of it. it is called `kind` because that is what it
# holds — a column says the phrase only when there is one.
add kind*
# narrowing is always there. one way in, so this column says the phrase.
add kind is-a
