const Joi = require('joi')

const fields = {
  issueLabel: Joi.alternatives().try(Joi.string(), Joi.boolean().only(false))
    .error(() => '"issueLabel" must be a string or false')
    .description('Issue label to use when marking as potential duplicate'),

  labelColor: Joi.alternatives().try(Joi.string(), Joi.boolean().only(false))
    .error(() => '"labelColor" must be a string or false')
    .description('Label color to use when marking as potential duplicate'),

  threshold: Joi.alternatives().try(Joi.number().min(0).max(1), Joi.boolean().only(false))
    .error(() => '"threshold" must be a float or false')
    .description('Label color to use when marking as potential duplicate'),

  referenceComment: Joi.alternatives().try(Joi.string(), Joi.any().only(false))
    .error(() => '"referenceComment" must be a string or false')
    .description('Comment to post when marking as potential duplicate'),

  fixedInVersionComment: Joi.alternatives().try(Joi.string(), Joi.any().only(false))
    .error(() => '"fixedInVersionComment" must be a string or false')
    .description('Comment to post when advising issue was fixed in a specific version')
}

module.exports = Joi.object().keys({
  issueLabel: fields.issueLabel.default('potential-duplicate'),
  labelColor: fields.labelColor.default('cfd3d7'),
  threshold: fields.threshold.default(0.60),
  referenceComment: fields.referenceComment.default(
    'Potential duplicates: \n' +
    '{{#issues}}' +
    '- {{{ shield }}} \n' +
    '{{/issues}}'
  ),
  fixedInVersionComment: fields.fixedInVersionComment.default(
    ':bulb: The issue has been fixed in [{{ appVersion }}](https://github.com/gitextensions/gitextensions/releases/tag/{{ appVersion }}). Please update your version.'
  )
})
