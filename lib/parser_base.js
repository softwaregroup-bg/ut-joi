const assert = require('assert');
class JoiJsonSchemaParser {
    constructor(joiObj, {
        childrenFieldName = 'children',
        optionsFieldName = 'options',
        ruleArgFieldName = 'arg',
        enumFieldName = 'valids',
        allowUnknownFlagName = 'allowUnknown',
        mode = ''
    } = {}) {
        if (typeof joiObj.describe !== 'function') {
            throw new Error('Not an joi object to be described.');
        }

        this.joiObj = joiObj;
        this.joiDescribe = joiObj.describe();
        this.childrenFieldName = childrenFieldName;
        this.optionsFieldName = optionsFieldName;
        this.ruleArgFieldName = ruleArgFieldName;
        this.enumFieldName = enumFieldName;
        this.allowUnknownFlagName = allowUnknownFlagName;
        this.mode = mode;
        this.jsonSchema = this._convertSchema(this.joiDescribe);
    }

    static getVersion(joiObj) {
        return joiObj._currentJoi && joiObj._currentJoi.version;
    }

    static getSupportVersion() {
        return '12';
    }

    _convertSchema(joiDescribe) {
        if (joiDescribe.flags?.presence === 'forbidden') return; // omit
        const schema = {};

        this._setBasicProperties(schema, joiDescribe);
        this._setNumberFieldProperties(schema, joiDescribe);
        this._setBinaryFieldProperties(schema, joiDescribe);
        this._setStringFieldProperties(schema, joiDescribe);
        this._setDateFieldProperties(schema, joiDescribe);
        this._setArrayFieldProperties(schema, joiDescribe);
        this._setObjectProperties(schema, joiDescribe);
        this._setAlternativesProperties(schema, joiDescribe);
        this._setAnyProperties(schema, joiDescribe);

        if (Array.isArray(schema.type)) {
            schema.oneOf = schema.type.map(type => ({type}));
            delete schema.type;
        }

        if (this._isNullable(joiDescribe)) {
            if (this.mode === 'swagger') {
                //
            } else if (this.mode === 'openapi') {
                schema.nullable = true;
            } else if (Array.isArray(schema.type)) {
                schema.type.push('null');
            } else if (typeof schema.type === 'string') {
                schema.type = [schema.type, 'null'];
            } else {
                if (Array.isArray(schema.oneOf)) {
                    for (const item of schema.oneOf) {
                        if (item.type && Object.keys(item).length === 1) {
                            item.type = Array.from(new Set([item.type, 'null'].flat()));
                            return schema;
                        }
                    }
                }
                return {
                    oneOf: [
                        {type: 'null'},
                        schema
                    ]
                };
            }
        }

        return schema;
    }

    _getFieldType(fieldDefn) {
        let type = fieldDefn.type;
        if (type === 'number' && fieldDefn.rules && fieldDefn.rules.length && fieldDefn.rules.some(({name}) => name === 'integer')) {
            type = 'integer';
        }
        return type;
    }

    _getFieldDescription(fieldDefn) {
        return fieldDefn.description;
    }

    _getFieldLabel(fieldDefn) {
        return fieldDefn.label;
    }

    _getFieldExample(fieldDefn) {
        return fieldDefn.examples;
    }

    _isRequired(fieldDefn) {
        const presence = fieldDefn.flags && fieldDefn.flags.presence;
        if (presence !== undefined) {
            assert(['required', 'optional', 'forbidden', 'ignore'].includes(presence), presence);
            return presence === 'required';
        }
        return (fieldDefn[this.optionsFieldName] && fieldDefn[this.optionsFieldName].presence) === 'required';
    }

    _getDefaultValue(fieldDefn) {
        return fieldDefn.flags && fieldDefn.flags.default;
    }

    _getEnum(fieldDefn) {
        if (!fieldDefn[this.enumFieldName] || !fieldDefn[this.enumFieldName].length || (this.enumFieldName === 'allow' && (!fieldDefn.flags || !fieldDefn.flags.only))) {
            return undefined;
        }
        const isString = fieldDefn.type === 'string';
        const only = (fieldDefn.flags && fieldDefn.flags.only);
        const valids = this.enumFieldName === 'valids';

        const enumList = fieldDefn[this.enumFieldName].filter(item => only || (valids && item != null) || (item != null && (!isString || item !== '')));
        return !enumList.length ? undefined : enumList;
    }

    _setIfNotEmpty(schema, field, value) {
        if (value !== null && value !== undefined) {
            schema[field] = value;
        }
    }

    _setIfNotUndefined(schema, field, value) {
        if (value !== undefined) {
            schema[field] = value;
        }
    }

    _isNullable(fieldDefn) {
        const enums = fieldDefn[this.enumFieldName];
        return (Array.isArray(enums) && enums.includes(null));
    }

    _setBasicProperties(fieldSchema, fieldDefn) {
        this._setIfNotEmpty(fieldSchema, 'type', this._getFieldType(fieldDefn));
        if (['swagger', 'openapi'].includes(this.mode)) {
            this._setIfNotUndefined(fieldSchema, 'example', this._getFieldExample(fieldDefn)?.[0]);
        } else {
            this._setIfNotEmpty(fieldSchema, 'examples', this._getFieldExample(fieldDefn));
            if (fieldSchema.examples && fieldSchema.examples.length) fieldSchema.example = fieldSchema.examples[0];
        }
        this._setIfNotEmpty(fieldSchema, 'description', this._getFieldDescription(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'title', this._getFieldLabel(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'default', this._getDefaultValue(fieldDefn));
        this._setIfNotEmpty(fieldSchema, 'enum', this._getEnum(fieldDefn));
        if (fieldSchema.enum && fieldSchema.enum.length === 1) {
            if (['swagger', 'openapi'].includes(this.mode)) {
                if (!fieldSchema.example) fieldSchema.example = fieldSchema.enum[0];
            } else {
                fieldSchema.const = fieldSchema.enum[0];
                if (!fieldSchema.examples) {
                    fieldSchema.examples = [fieldSchema.const];
                    fieldSchema.example = fieldSchema.const;
                }
                delete fieldSchema.enum;
            }
        }
    }

    _isType(schema, ...types) {
        return schema && schema.type && [].concat(schema.type).some(item => types.includes(item));
    }

    _setNumberFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'number', 'integer')) {
            return;
        }

        const ruleArgFieldName = this.ruleArgFieldName;

        fieldDefn.rules && fieldDefn.rules.forEach((rule) => {
            const value = rule[ruleArgFieldName];
            switch (rule.name) {
                case 'max':
                    fieldSchema.maximum = value;
                    break;
                case 'min':
                    fieldSchema.minimum = value;
                    break;
                case 'greater':
                    fieldSchema.exclusiveMinimum = true;
                    fieldSchema.minimum = value;
                    break;
                case 'less':
                    fieldSchema.exclusiveMaximum = true;
                    fieldSchema.maximum = value;
                    break;
                case 'multiple':
                    fieldSchema.multipleOf = value;
                    break;
                default:
                    break;
            }
        });
    }

    _setBinaryFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'binary')) {
            return;
        }
        fieldSchema.type = 'string';
        if (fieldDefn.flags && fieldDefn.flags.encoding) {
            fieldSchema.contentEncoding = fieldDefn.flags.encoding;
        }
        fieldSchema.format = 'binary';
    }

    _setStringFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'string')) {
            return;
        }

        if (fieldDefn.flags && fieldDefn.flags.encoding) {
            fieldSchema.contentEncoding = fieldDefn.flags.encoding;
        }
        fieldDefn.meta && fieldDefn.meta.forEach((m) => {
            if (m.contentMediaType) {
                fieldSchema.contentMediaType = m.contentMediaType;
            }
        });

        const ruleArgFieldName = this.ruleArgFieldName;

        fieldDefn.rules && fieldDefn.rules.forEach((rule) => {
            switch (rule.name) {
                case 'min':
                    fieldSchema.minLength = rule[ruleArgFieldName];
                    break;
                case 'max':
                    fieldSchema.maxLength = rule[ruleArgFieldName];
                    break;
                case 'email':
                    fieldSchema.format = 'email';
                    break;
                case 'hostname':
                    fieldSchema.format = 'hostname';
                    break;
                case 'uri':
                    fieldSchema.format = 'uri';
                    break;
                case 'ip': {
                    const versions = rule[ruleArgFieldName].version;
                    if (versions && versions.length) {
                        if (versions.length === 1) {
                            fieldSchema.format = versions[0];
                        } else {
                            fieldSchema.oneOf = versions.map((version) => {
                                return {
                                    format: version
                                };
                            });
                        }
                    } else {
                        fieldSchema.format = 'ipv4';
                    }
                    break;
                }
                case 'regex':
                    fieldSchema.pattern = rule[ruleArgFieldName].pattern.source;
                    break;
                default:
                    break;
            }
        });
    }

    _setArrayFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'array')) {
            return;
        }

        const ruleArgFieldName = this.ruleArgFieldName;

        fieldDefn.rules && fieldDefn.rules.forEach((rule) => {
            const value = rule[ruleArgFieldName];
            switch (rule.name) {
                case 'max':
                    fieldSchema.maxItems = value;
                    break;
                case 'min':
                    fieldSchema.minItems = value;
                    break;
                case 'length':
                    fieldSchema.maxItems = value;
                    fieldSchema.minItems = value;
                    break;
                case 'unique':
                    fieldSchema.uniqueItems = true;
                    break;
                default:
                    break;
            }
        });

        if (!fieldDefn.items) {
            // fieldSchema.items = {};
            return;
        }

        if (fieldDefn.items.length === 1) {
            fieldSchema.items = this._convertSchema(fieldDefn.items[0]);
        } else {
            fieldSchema.items = {
                anyOf: fieldDefn.items.map(this._convertSchema.bind(this))
            };
        }
    }

    _setDateFieldProperties(fieldSchema, fieldDefn) {
        if (!this._isType(fieldSchema, 'date')) {
            return;
        }

        if (fieldDefn.flags && fieldDefn.flags.timestamp) {
            fieldSchema.type = 'integer';
        } else {
            // https://datatracker.ietf.org/doc/draft-handrews-json-schema-validation
            // JSON Schema does not have date type, but use string with format.
            // However, joi definition cannot clearly tells the date/time/date-time format
            fieldSchema.type = 'string';
            fieldSchema.format = 'date-time';
        }
    }

    _setObjectProperties(schema, joiDescribe) {
        if (!this._isType(schema, 'object')) {
            return;
        }

        schema.properties = {};
        schema.required = [];

        schema.additionalProperties = (joiDescribe[this.optionsFieldName] && joiDescribe[this.optionsFieldName].allowUnknown) || !joiDescribe[this.childrenFieldName] || false;
        if (joiDescribe.flags && typeof joiDescribe.flags[this.allowUnknownFlagName] !== 'undefined') {
            schema.additionalProperties = joiDescribe.flags[this.allowUnknownFlagName];
        }

        const that = this;
        joiDescribe[this.childrenFieldName] && Object.entries(joiDescribe[this.childrenFieldName]).forEach(([key, fieldDefn]) => {
            const fieldSchema = that._convertSchema(fieldDefn);
            if (that._isRequired(fieldDefn)) {
                schema.required.push(key);
            }

            schema.properties[key] = fieldSchema;
        });
        if (!schema.required.length) {
            delete schema.required;
        }
    }

    _setAlternativesProperties(schema, joiDescribe) {
        if (!this._isType(schema, 'alternatives')) {
            return;
        }

        schema.anyOf = joiDescribe.alternatives.map(this._convertSchema.bind(this));
        delete schema.type;
    }

    _setAnyProperties(schema) {
        if (!this._isType(schema, 'any')) {
            return;
        }

        if (['swagger', 'openapi'].includes(this.mode)) {
            delete schema.type;
        } else {
            schema.type = [
                'array',
                'boolean',
                'number',
                'object',
                'string'
            ];
        }
    }
}

module.exports = JoiJsonSchemaParser;
