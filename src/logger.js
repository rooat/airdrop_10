//@flow
var winston = require('winston')
const logger = winston.createLogger({
  // format: winston.format.json(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.prettyPrint()
  ),
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combinedLog.log' })
  ]
});

module.exports = logger
