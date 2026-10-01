import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { MATCH_CARD_TYPE, matchCardShapeMigrations, matchCardShapeProps } from './matchCardShape'

// The single source of truth for which record types a diagram may contain.
// The worker validates every incoming change against this, so any custom shape
// or binding must be registered here (props validators + migrations) as well
// as in the client's ShapeUtil/BindingUtil lists, or the server will reject it.
export const diagramSchema = createTLSchema({
	shapes: {
		...defaultShapeSchemas,
		[MATCH_CARD_TYPE]: { props: matchCardShapeProps, migrations: matchCardShapeMigrations },
	},
	bindings: { ...defaultBindingSchemas },
})
